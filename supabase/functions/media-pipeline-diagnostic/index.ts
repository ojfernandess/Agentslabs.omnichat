/**
 * Diagnóstico do pipeline de mídia (Evolution → webhook → storage; envio outbound).
 * POST JSON: { channel_id, skip_s3_write_probe?: boolean }
 * POST multipart: channel_id, skip_s3_write_probe? (text), test_image (file) — mesmo JWT + apikey.
 *
 * S3/probe/upload de teste estão INLINE — o bundler do Supabase Cloud não inclui ../_shared.
 * Manter em sync com supabase/functions/_shared/s3-media.ts, s3-write-probe.ts, diagnostic-test-upload.ts
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

// --- S3 base (inline) ---
function s3MediaConfigured(): boolean {
  return Boolean(
    Deno.env.get("S3_MEDIA_ENDPOINT")?.trim() &&
      Deno.env.get("S3_MEDIA_ACCESS_KEY")?.trim() &&
      Deno.env.get("S3_MEDIA_SECRET_KEY")?.trim() &&
      Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim(),
  );
}

let _s3MediaClient: S3Client | null = null;
function getS3MediaClient(): S3Client {
  if (_s3MediaClient) return _s3MediaClient;
  const endpoint = Deno.env.get("S3_MEDIA_ENDPOINT")!.trim();
  const region = Deno.env.get("S3_MEDIA_REGION")?.trim() || "us-east-1";
  const forcePathStyle = Deno.env.get("S3_MEDIA_FORCE_PATH_STYLE") !== "false";
  _s3MediaClient = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: Deno.env.get("S3_MEDIA_ACCESS_KEY")!.trim(),
      secretAccessKey: Deno.env.get("S3_MEDIA_SECRET_KEY")!.trim(),
    },
    forcePathStyle,
  });
  return _s3MediaClient;
}

function publicUrlForS3Object(bucket: string, key: string): string {
  const base = Deno.env.get("MEDIA_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  const safeKey = key.replace(/^\//, "");
  return `${base}/${bucket}/${safeKey}`;
}

function S3_BUCKET_MESSAGE(): string {
  return Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
}

// --- s3_write_probe (inline) ---
type S3WriteProbeResult =
  | { ran: false; skipped_reason: string }
  | {
      ran: true;
      ok: boolean;
      endpoint_host: string;
      bucket: string;
      probe_key: string;
      put_timeout_ms?: number;
      put_ms?: number;
      delete_ms?: number;
      delete_failed?: string;
      error?: string;
    };

/** Igual a upload-media: secret S3_MEDIA_PUT_TIMEOUT_MS (5000–120000), predefinido 22000. */
function s3ProbePutTimeoutMs(): number {
  const raw = Deno.env.get("S3_MEDIA_PUT_TIMEOUT_MS")?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 5_000 && n <= 120_000) return n;
  return 22_000;
}

function s3ProbeEndpointHost(): string {
  try {
    const u = Deno.env.get("S3_MEDIA_ENDPOINT")?.trim();
    if (!u) return "";
    return new URL(u).host;
  } catch {
    return "?";
  }
}

async function runS3WriteProbeFromEdge(): Promise<S3WriteProbeResult> {
  if (!s3MediaConfigured()) {
    return {
      ran: false,
      skipped_reason: "Secrets incompletas: S3_MEDIA_ENDPOINT, ACCESS_KEY, SECRET_KEY e MEDIA_PUBLIC_BASE_URL",
    };
  }

  const bucket = S3_BUCKET_MESSAGE();
  const probeKey = `diagnostic-probe/${crypto.randomUUID()}.txt`;
  const client = getS3MediaClient();
  const bytes = new TextEncoder().encode("ok");
  const putTimeout = s3ProbePutTimeoutMs();

  const tPut = Date.now();
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), putTimeout);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: probeKey,
          Body: bytes,
          ContentType: "text/plain",
        }),
        { abortSignal: ac.signal },
      );
    } finally {
      clearTimeout(tid);
    }
  } catch (e) {
    return {
      ran: true,
      ok: false,
      endpoint_host: s3ProbeEndpointHost(),
      bucket,
      probe_key: probeKey,
      put_timeout_ms: putTimeout,
      put_ms: Date.now() - tPut,
      error: String(e).slice(0, 400),
    };
  }

  const put_ms = Date.now() - tPut;
  const tDel = Date.now();
  let delete_failed: string | undefined;
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), putTimeout);
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }),
        { abortSignal: ac.signal },
      );
    } finally {
      clearTimeout(tid);
    }
  } catch (e) {
    delete_failed = String(e).slice(0, 200);
  }
  const delete_ms = Date.now() - tDel;

  return {
    ran: true,
    ok: true,
    endpoint_host: s3ProbeEndpointHost(),
    bucket,
    probe_key: probeKey,
    put_timeout_ms: putTimeout,
    put_ms,
    delete_ms,
    ...(delete_failed ? { delete_failed } : {}),
  };
}

// --- diagnostic image upload (inline) ---
type DiagnosticImageUploadResult = {
  ok: boolean;
  path: string;
  bucket?: string;
  url?: string;
  storage_backend?: "s3" | "supabase_storage";
  signed_url?: string | null;
  error?: string;
  duration_ms: number;
  note?: string;
};

const DIAG_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const DIAG_IMAGE_PUT_MS = 25_000;
const DIAG_ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function s3EdgePutDisabled(): boolean {
  const v = Deno.env.get("S3_MEDIA_DISABLE_EDGE_PUT")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function diagExtFromMime(m: string): string {
  const x = m.toLowerCase();
  if (x.includes("png")) return "png";
  if (x.includes("webp")) return "webp";
  if (x.includes("gif")) return "gif";
  return "jpg";
}

function diagStoragePublicUrl(svc: SupabaseClient, path: string): string {
  const { data } = svc.storage.from("message-media").getPublicUrl(path);
  return data.publicUrl;
}

async function runDiagnosticImageUpload(
  svc: SupabaseClient,
  organizationId: string,
  file: File,
): Promise<DiagnosticImageUploadResult> {
  const t0 = Date.now();
  const ct = (file.type || "").split(";")[0].trim().toLowerCase() || "application/octet-stream";

  if (!ct.startsWith("image/") || !DIAG_ALLOWED_IMAGE.has(ct)) {
    return {
      ok: false,
      path: "",
      error: "Envie JPEG, PNG, GIF ou WebP.",
      duration_ms: Date.now() - t0,
    };
  }
  if (file.size > DIAG_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      path: "",
      error: "Máximo 2 MB para teste de diagnóstico.",
      duration_ms: Date.now() - t0,
    };
  }

  const ext =
    file.name && /\.(jpe?g|png|gif|webp)$/i.test(file.name)
      ? (file.name.split(".").pop() || diagExtFromMime(ct)).toLowerCase().replace("jpeg", "jpg")
      : diagExtFromMime(ct);
  const path = `${organizationId}/__diagnostic__/${crypto.randomUUID()}.${ext}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const bucket = S3_BUCKET_MESSAGE();

  if (s3MediaConfigured() && !s3EdgePutDisabled()) {
    try {
      const client = getS3MediaClient();
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), DIAG_IMAGE_PUT_MS);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: path,
            Body: buf,
            ContentType: ct,
          }),
          { abortSignal: ac.signal },
        );
      } finally {
        clearTimeout(tid);
      }
      const url = publicUrlForS3Object(bucket, path);
      return {
        ok: true,
        path,
        bucket,
        url,
        storage_backend: "s3",
        signed_url: null,
        duration_ms: Date.now() - t0,
        note: "Objeto mantido em __diagnostic__/ para verificação manual; apague no MinIO se quiser.",
      };
    } catch (e) {
      console.warn("[media-pipeline-diagnostic] S3 upload teste falhou — fallback Storage", String(e).slice(0, 200));
    }
  }

  const { error: upErr } = await svc.storage.from("message-media").upload(path, buf, {
    contentType: ct,
    upsert: false,
  });
  if (upErr) {
    return {
      ok: false,
      path,
      error: upErr.message,
      duration_ms: Date.now() - t0,
    };
  }
  const url = diagStoragePublicUrl(svc, path);
  return {
    ok: true,
    path,
    bucket: "message-media",
    url,
    storage_backend: "supabase_storage",
    signed_url: null,
    duration_ms: Date.now() - t0,
    note: "Gravado em Supabase Storage (message-media). Pasta __diagnostic__/ no bucket.",
  };
}

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveUserFromJwt(jwt: string): Promise<{ id: string } | null> {
  const clean = jwt.trim();
  if (!clean) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (url && anon) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${clean}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (!error && user) return user;
  }
  const svc = getServiceClient();
  const { data: { user }, error } = await svc.auth.getUser(clean);
  if (!error && user) return user;
  return null;
}

function hasNonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function attachmentSummary(row: { attachments: unknown; content_type: string | null }): {
  has_attachments: boolean;
  count: number;
} {
  const a = row.attachments;
  const arr = Array.isArray(a) ? a : [];
  return { has_attachments: arr.length > 0, count: arr.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ctHeader = req.headers.get("content-type") ?? "";
  let channelId = "";
  let skipS3Write = false;
  let testImage: File | null = null;

  if (ctHeader.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return new Response(JSON.stringify({ error: "FormData inválido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    channelId = String(form.get("channel_id") ?? "").trim();
    skipS3Write = String(form.get("skip_s3_write_probe") ?? "") === "true";
    const f = form.get("test_image");
    testImage = f instanceof File && f.size > 0 ? f : null;
  } else {
    let body: { channel_id?: string; skip_s3_write_probe?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    channelId = String(body.channel_id ?? "").trim();
    skipS3Write = body.skip_s3_write_probe === true;
  }

  if (!channelId) {
    return new Response(JSON.stringify({ error: "channel_id é obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const user = await resolveUserFromJwt(auth.slice(7).trim());
  if (!user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, organization_id, channel_type, config, is_active")
    .eq("id", channelId)
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return new Response(JSON.stringify({ error: "Sem acesso" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let test_image_upload: Awaited<ReturnType<typeof runDiagnosticImageUpload>> | null = null;
  if (testImage) {
    test_image_upload = await runDiagnosticImageUpload(supabase, channel.organization_id as string, testImage);
  }

  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  const evo = (cfg.evolution ?? {}) as Record<string, unknown>;
  const baseUrl = String(evo.base_url ?? evo.baseUrl ?? cfg.evolution_base_url ?? "").trim();
  const apiKey = Boolean(String(evo.api_key ?? evo.apiKey ?? cfg.evolution_api_key ?? "").trim());
  const instanceName = String(evo.instance_name ?? evo.instanceName ?? cfg.evolution_instance_name ?? "").trim();
  const provider = String(cfg.whatsapp_provider ?? "").toLowerCase();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const webhookUrl =
    channel.channel_type === "whatsapp" && provider === "evolution"
      ? `${supabaseUrl}/functions/v1/evolution-whatsapp-webhook?channel_id=${channel.id}`
      : null;

  const internalOk = (Deno.env.get("INTERNAL_HOOK_SECRET")?.length ?? 0) >= 16;

  const { data: convoRows } = await supabase
    .from("conversations")
    .select("id")
    .eq("channel_id", channelId)
    .limit(300);

  const convoIds = (convoRows ?? []).map((r) => r.id as string);

  type MsgRow = {
    id: string;
    created_at: string;
    content_type: string | null;
    message_type: string | null;
    attachments: unknown;
    metadata: unknown;
  };

  let recentIncomingMedia: Array<{
    id: string;
    created_at: string;
    content_type: string | null;
    has_attachments: boolean;
    attachment_count: number;
    source: string | null;
  }> = [];

  let recentOutgoingImage: Array<{
    id: string;
    created_at: string;
    has_attachments: boolean;
    attachment_count: number;
  }> = [];

  if (convoIds.length > 0) {
    const { data: inc } = await supabase
      .from("messages")
      .select("id, created_at, content_type, message_type, attachments, metadata")
      .in("conversation_id", convoIds)
      .eq("message_type", "incoming")
      .in("content_type", ["image", "video", "document"])
      .order("created_at", { ascending: false })
      .limit(8);

    recentIncomingMedia = (inc as MsgRow[] | null)?.map((r) => {
      const { has_attachments, count } = attachmentSummary(r);
      const meta = r.metadata as Record<string, unknown> | null;
      const source = meta && typeof meta.source === "string" ? meta.source : null;
      return {
        id: r.id,
        created_at: r.created_at,
        content_type: r.content_type,
        has_attachments,
        attachment_count: count,
        source,
      };
    }) ?? [];

    const { data: outg } = await supabase
      .from("messages")
      .select("id, created_at, content_type, attachments")
      .in("conversation_id", convoIds)
      .eq("message_type", "outgoing")
      .eq("content_type", "image")
      .order("created_at", { ascending: false })
      .limit(6);

    recentOutgoingImage = (outg as MsgRow[] | null)?.map((r) => {
      const { has_attachments, count } = attachmentSummary(r);
      return { id: r.id, created_at: r.created_at, has_attachments, attachment_count: count };
    }) ?? [];
  }

  /** Texto de entrada que parece mídia mas foi gravado como content_type=text (falha de normalização / upload no webhook). */
  let incomingTextLooksLikeMedia: Array<{ id: string; created_at: string; content_preview: string }> = [];
  if (convoIds.length > 0) {
    const { data: incText } = await supabase
      .from("messages")
      .select("id, created_at, content, metadata")
      .in("conversation_id", convoIds)
      .eq("message_type", "incoming")
      .eq("content_type", "text")
      .order("created_at", { ascending: false })
      .limit(50);
    const looksLike = (content: string, meta: unknown): boolean => {
      const m = meta as Record<string, unknown> | null;
      const t = content.trim();
      if (/^\[(imageMessage|videoMessage|documentMessage|stickerMessage|audioMessage|imagemessage)/i.test(t)) {
        return true;
      }
      if (m?.source !== "evolution") return false;
      if (/\[Imagem\]|\[Vídeo\]|\[Sticker\]|\[Áudio\]|\[Documento\]|📷|🎬|🎤|📎/.test(t)) return true;
      return false;
    };
    incomingTextLooksLikeMedia = (incText ?? [])
      .filter((r) => looksLike(String((r as { content?: string }).content ?? ""), (r as { metadata?: unknown }).metadata))
      .slice(0, 8)
      .map((r) => {
        const row = r as { id: string; created_at: string; content?: string };
        const prev = String(row.content ?? "").slice(0, 120);
        return { id: row.id, created_at: row.created_at, content_preview: prev };
      });
  }

  let mediaPublicProbe: {
    probe_url?: string;
    http_status?: number;
    reachable: boolean;
    anonymous_get_ok: boolean;
    /** HEAD (ou GET Range) a message-media/test.txt — aproxima um GET de mídia como o WhatsApp faz */
    object_probe_url?: string;
    object_http_status?: number;
    object_anonymous_ok?: boolean;
    error?: string;
  } = { reachable: false, anonymous_get_ok: false, error: "not_checked" };
  const pubBase = Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim();
  const messageBucket = Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
  if (pubBase) {
    try {
      const baseNoSlash = pubBase.replace(/\/$/, "");
      // Não forçar "/" final: em MinIO/nginx, .../bucket/ costuma dar 403 e .../bucket devolve ListBucket 200.
      const r = await fetch(baseNoSlash, {
        method: "GET",
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
      });
      const st = r.status;
      const baseOk = st >= 200 && st < 400;

      const objectUrl = `${baseNoSlash}/${messageBucket}/test.txt`;
      let objectStatus: number | undefined;
      let objectOk = false;
      try {
        const ro = await fetch(objectUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(8000),
          redirect: "manual",
        });
        objectStatus = ro.status;
        objectOk = objectStatus >= 200 && objectStatus < 400;
      } catch {
        /* ignore */
      }
      if (!objectOk) {
        try {
          const rg = await fetch(objectUrl, {
            method: "GET",
            signal: AbortSignal.timeout(8000),
            redirect: "manual",
            headers: { Range: "bytes=0-0" },
          });
          objectStatus = rg.status;
          objectOk = rg.status === 206 || (rg.status >= 200 && rg.status < 400);
        } catch {
          objectStatus = objectStatus ?? undefined;
        }
      }

      const anonymous_get_ok = baseOk || objectOk;

      mediaPublicProbe = {
        probe_url: baseNoSlash,
        http_status: st,
        reachable: true,
        anonymous_get_ok,
        object_probe_url: objectUrl,
        object_http_status: objectStatus,
        object_anonymous_ok: objectOk,
      };
    } catch (e) {
      mediaPublicProbe = { reachable: false, anonymous_get_ok: false, error: String(e).slice(0, 160) };
    }
  } else {
    mediaPublicProbe = {
      reachable: false,
      anonymous_get_ok: false,
      error: "MEDIA_PUBLIC_BASE_URL não definida nas Edge Functions",
    };
  }

  const s3WriteProbe = skipS3Write
    ? ({
        ran: false as const,
        skipped_reason: "skip_s3_write_probe=true no corpo do POST",
      })
    : await runS3WriteProbeFromEdge();

  const issues: string[] = [];
  if (channel.channel_type === "whatsapp" && provider !== "evolution") {
    issues.push("Canal não usa whatsapp_provider=evolution — este diagnóstico foca-se em Evolution + mídia.");
  }
  if (provider === "evolution") {
    if (!hasNonEmpty(baseUrl)) issues.push("Falta evolution.base_url na config da caixa (necessário para getBase64FromMediaMessage).");
    if (!apiKey) issues.push("Falta evolution.api_key na config da caixa.");
    if (!instanceName) issues.push("Falta evolution.instance_name na config da caixa.");
  }
  if (!s3MediaConfigured()) {
    issues.push(
      "Secrets S3 incompletas nas Edge Functions — uploads/recebimento usam Supabase Storage (message-media), não MinIO.",
    );
  }
  if (s3MediaConfigured() && !skipS3Write && s3WriteProbe.ran && !s3WriteProbe.ok) {
    const storageFallbackWorked =
      test_image_upload != null &&
      test_image_upload.ok === true &&
      test_image_upload.storage_backend === "supabase_storage";
    if (storageFallbackWorked) {
      issues.push(
        "PUT à API S3/MinIO desde a Edge falhou (timeout/rede ou API inacessível). O teste de imagem gravou em Supabase Storage — o fluxo de anexos pode estar OK com fallback. Defina S3_MEDIA_DISABLE_EDGE_PUT=true para não tentar MinIO no upload-media. Para MinIO: rota API alcançável da cloud ou aumente S3_MEDIA_PUT_TIMEOUT_MS (o probe usa o mesmo valor).",
      );
    } else {
      issues.push(
        "Probe S3 (PUT desde Edge Function) falhou — MinIO inacessível da cloud Supabase, credenciais erradas ou bucket/policy. Veja edge_functions.s3_write_probe.error. Para upload pela app sem MinIO nas edges: S3_MEDIA_DISABLE_EDGE_PUT=true em upload-media.",
      );
    }
  }
  if (!internalOk) {
    issues.push("INTERNAL_HOOK_SECRET em falta ou curto — send-outbound-message → send-whatsapp pode falhar.");
  }
  if (recentIncomingMedia.some((m) => !m.has_attachments)) {
    issues.push(
      "Há mensagens recebidas (imagem/vídeo/documento) na BD sem anexos — o webhook não gravou ficheiros (S3/Storage) ou a mídia não foi descarregada.",
    );
  }
  if (recentOutgoingImage.some((m) => !m.has_attachments)) {
    issues.push("Há imagens de saída sem anexos na BD — falha provável no upload antes de enviar ao WhatsApp.");
  }
  if (pubBase && mediaPublicProbe.reachable && !mediaPublicProbe.anonymous_get_ok) {
    const h403 =
      mediaPublicProbe.http_status === 403 || mediaPublicProbe.object_http_status === 403;
    const h401 =
      mediaPublicProbe.http_status === 401 || mediaPublicProbe.object_http_status === 401;
    if (h403) {
      issues.push(
        "GET/HEAD anónimo à MEDIA_PUBLIC_BASE_URL ou a message-media/test.txt devolveu 403 — o WhatsApp precisa de GET público a URLs de objeto (…/message-media/org/…/ficheiro). Confirme MEDIA_PUBLIC_BASE_URL sem barra final duplicada e política MinIO (GetObject).",
      );
    } else if (h401) {
      issues.push(
        "GET/HEAD à base ou ao objeto público devolveu 401 — autenticação à frente do storage; os links públicos de mídia não funcionarão para o WhatsApp até remover auth nesse path ou usar URL assinada estável.",
      );
    }
  }
  if (incomingTextLooksLikeMedia.length > 0) {
    issues.push(
      "Há mensagens recebidas gravadas como texto com aspeto de mídia ([imageMessage], [Imagem], etc.) — o webhook não as tratou como image/video/document ou não anexou ficheiros. Veja recent.incoming_text_looks_like_media e logs evolution-whatsapp-webhook (trace_id / inbound_diagnostic).",
    );
  }
  if (test_image_upload && !test_image_upload.ok) {
    issues.push(
      "Upload de imagem de teste falhou — veja test_image_upload.error (mesmo fluxo que upload-media / conversas).",
    );
  }

  const hints = [
    "MEDIA_PUBLIC_BASE_URL deve ser só o host (ex. https://s3.agentslabs.cloud): as funções acrescentam /<bucket>/chave; se incluir …/message-media no fim, o URL público fica …/message-media/message-media/… e falha.",
    "Nos logs do Supabase (evolution-whatsapp-webhook), procure trace_id na resposta JSON e o mesmo id na linha de log; evolution_normalize inclui content_type_counts e chatwoot_enriched_payload.",
    "Se upsert_matched=false, o evento do webhook não é MESSAGES_UPSERT — ajuste eventos na Evolution.",
    "Se skips.missing_key > 0, o JSON não traz key no stanza — versão diferente da Evolution.",
    "Ative webhook_base64 na Evolution para receber base64 de mídia no payload (reduz dependência da API getBase64).",
    "edge_functions.s3_write_probe: PUT+DELETE de teste no bucket message-media desde a Edge — se ok:false, o mesmo falha em upload-media (rede/credenciais). Use skip_s3_write_probe:true no POST para pular (mais rápido).",
    "test_image_upload: envie POST multipart com campo test_image (JPEG/PNG/GIF/WebP, máx. 2 MB) + channel_id para simular o envio de anexo nas conversas.",
  ];
  if (provider === "evolution") {
    hints.push(
      "Se chatwoot_enriched_payload:true nos logs (campos chatwootMessageId / inbox / conversation no JSON), a Evolution pode estar integrada com Chatwoot — evite dois webhooks a processar a mesma mensagem ou confirme qual sistema deve gravar na BD.",
    );
  }
  if (recentIncomingMedia.length === 0 && convoIds.length > 0 && incomingTextLooksLikeMedia.length === 0) {
    hints.push(
      "Nenhuma mensagem incoming com content_type image|video|document nas últimas conversas — confirme na Evolution eventos MESSAGES_UPSERT e URL do webhook com o channel_id desta caixa.",
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
      channel: {
        id: channel.id,
        channel_type: channel.channel_type,
        is_active: channel.is_active,
        whatsapp_provider: provider || null,
        evolution: {
          base_url_configured: hasNonEmpty(baseUrl),
          api_key_configured: apiKey,
          instance_name_configured: hasNonEmpty(instanceName),
        },
      },
      edge_functions: {
        s3_media_fully_configured: s3MediaConfigured(),
        /** PUT+DELETE real no MinIO/S3 a partir desta Edge (valida o mesmo caminho que upload-media). */
        s3_write_probe: s3WriteProbe,
        media_public_base_url_configured: Boolean(pubBase),
        media_public_url_probe: mediaPublicProbe,
        /** true só se GET à base devolver 2xx/3xx (403 na raiz indica bloqueio típico a anónimos). */
        media_public_anonymous_get_ok: mediaPublicProbe.anonymous_get_ok,
        internal_hook_secret_ok: internalOk,
        supabase_url_configured: Boolean(supabaseUrl),
      },
      webhook: {
        evolution_inbound_post_url: webhookUrl,
      },
      recent: {
        incoming_image_video_document: recentIncomingMedia,
        incoming_text_looks_like_media: incomingTextLooksLikeMedia,
        outgoing_image: recentOutgoingImage,
      },
      /** Presente quando o POST foi multipart com ficheiro test_image. */
      test_image_upload,
      issues,
      hints,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
