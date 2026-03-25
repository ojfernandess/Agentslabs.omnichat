/**
 * Upload de mídia (mensagens + avatar inbox) para S3/MinIO (Easypanel) em vez do Supabase Storage.
 * Requer secrets: S3_MEDIA_*, MEDIA_PUBLIC_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY.
 * Se MinIO for inacessível da cloud Supabase: S3_MEDIA_DISABLE_EDGE_PUT=true (grava em Storage sem tentar S3).
 *
 * Política de anexos INLINE — bundle remoto não inclui ../_shared. Sync: _shared/media-upload-policy.ts.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";
import { GetObjectCommand } from "npm:@aws-sdk/client-s3@3.654.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.654.0";

const LEGACY_MAX_BYTES = 10 * 1024 * 1024;
const STRICT_IMAGE_MAX = 10 * 1024 * 1024;
const STRICT_AUDIO_MAX = 50 * 1024 * 1024;
const STRICT_VIDEO_MAX = 500 * 1024 * 1024;
const STRICT_PDF_MAX = 10 * 1024 * 1024;

const LEGACY_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
]);

function isLegacyModeFromEnv(envGetter: (k: string) => string | undefined): boolean {
  const v = envGetter("MEDIA_LEGACY_ATTACHMENTS")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function maxBytesForMessageMime(contentType: string, legacy: boolean): number {
  if (legacy) return LEGACY_MAX_BYTES;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (
    ct === "image/jpeg" ||
    ct === "image/png" ||
    ct === "image/gif" ||
    ct === "image/webp" ||
    ct === "application/pdf"
  ) {
    return ct === "application/pdf" ? STRICT_PDF_MAX : STRICT_IMAGE_MAX;
  }
  if (ct === "audio/mpeg" || ct === "audio/wav" || ct === "audio/wave" || ct === "audio/x-wav") {
    return STRICT_AUDIO_MAX;
  }
  if (ct === "video/mp4" || ct === "video/webm") return STRICT_VIDEO_MAX;
  return 0;
}

function isAllowedMessageMimeType(contentType: string, legacy: boolean): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (legacy) {
    if (ct.startsWith("image/")) return true;
    return LEGACY_ALLOWED.has(ct);
  }
  return maxBytesForMessageMime(ct, false) > 0;
}

function validateMessageFileMagic(contentType: string, buf: Uint8Array, legacy: boolean): string | null {
  if (legacy) return null;
  if (buf.length < 4) return null;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const u8 = (i: number) => buf[i] ?? 0;
  if (ct === "image/jpeg") {
    if (u8(0) !== 0xff || u8(1) !== 0xd8 || u8(2) !== 0xff) return "Conteúdo não corresponde a JPEG";
    return null;
  }
  if (ct === "image/png") {
    if (u8(0) !== 0x89 || u8(1) !== 0x50 || u8(2) !== 0x4e || u8(3) !== 0x47) return "Conteúdo não corresponde a PNG";
    return null;
  }
  if (ct === "image/webp") {
    if (u8(0) !== 0x52 || u8(1) !== 0x49 || u8(2) !== 0x46 || u8(3) !== 0x46) return "Conteúdo não corresponde a WebP (RIFF)";
    const tag = String.fromCharCode(u8(8), u8(9), u8(10), u8(11));
    if (tag !== "WEBP") return "Conteúdo não corresponde a WebP";
    return null;
  }
  if (ct === "image/gif") {
    if (buf.length < 6) return null;
    const sig = String.fromCharCode(u8(0), u8(1), u8(2), u8(3), u8(4), u8(5));
    if (sig !== "GIF87a" && sig !== "GIF89a") return "Conteúdo não corresponde a GIF";
    return null;
  }
  if (ct === "audio/mpeg") {
    if (buf.length >= 3 && u8(0) === 0xff && (u8(1) & 0xe0) === 0xe0) return null;
    if (buf.length >= 3 && u8(0) === 0x49 && u8(1) === 0x44 && u8(2) === 0x33) return null;
    return "Conteúdo não corresponde a MP3";
  }
  if (ct === "audio/wav" || ct === "audio/wave" || ct === "audio/x-wav") {
    if (u8(0) !== 0x52 || u8(1) !== 0x49 || u8(2) !== 0x46 || u8(3) !== 0x46) return "Conteúdo não corresponde a WAV";
    return null;
  }
  if (ct === "video/mp4") {
    let ok = false;
    for (let i = 0; i <= Math.min(buf.length - 8, 32); i++) {
      if (u8(i + 4) === 0x66 && u8(i + 5) === 0x74 && u8(i + 6) === 0x79 && u8(i + 7) === 0x70) {
        ok = true;
        break;
      }
    }
    if (!ok) return "Conteúdo não corresponde a MP4 (ftyp)";
    return null;
  }
  if (ct === "video/webm") {
    if (u8(0) !== 0x1a || u8(1) !== 0x45 || u8(2) !== 0xdf || u8(3) !== 0xa3) return "Conteúdo não corresponde a WebM";
    return null;
  }
  if (ct === "application/pdf") {
    if (buf.length < 5) return null;
    if (String.fromCharCode(u8(0), u8(1), u8(2), u8(3), u8(4)) !== "%PDF-") {
      return "Conteúdo não corresponde a PDF";
    }
    return null;
  }
  return null;
}

/** S3/MinIO — cliente inline (manter em sync com _shared/s3-media.ts) */
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

function s3PutTimeoutMs(): number {
  const raw = Deno.env.get("S3_MEDIA_PUT_TIMEOUT_MS")?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 5_000 && n <= 120_000) return n;
  return 22_000;
}

function s3EndpointHostForLog(): string {
  try {
    const u = Deno.env.get("S3_MEDIA_ENDPOINT")?.trim();
    if (!u) return "";
    return new URL(u).host;
  } catch {
    return "?";
  }
}

/** MinIO na LAN / sem rota desde as Edge Functions → evita PUT com timeout e o aviso; usa só Supabase Storage nesta função. */
function s3EdgePutDisabled(): boolean {
  const v = Deno.env.get("S3_MEDIA_DISABLE_EDGE_PUT")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function s3PutObjectWithRetry(
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = getS3MediaClient();
  const putMs = s3PutTimeoutMs();
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), putMs);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
          { abortSignal: ac.signal },
        );
      } finally {
        clearTimeout(tid);
      }
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr ?? new Error("Falha ao gravar no S3/MinIO");
}

/** Scan externo opcional (ClamAV, SaaS). Falha fechada se o URL estiver definido e o scan falhar. */
async function optionalExternalVirusScan(
  buf: Uint8Array,
  fileName: string,
  contentType: string,
): Promise<string | null> {
  const url = Deno.env.get("MEDIA_SCAN_WEBHOOK_URL")?.trim();
  if (!url) return null;
  const secret = Deno.env.get("MEDIA_SCAN_WEBHOOK_SECRET")?.trim();
  try {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: contentType }), fileName.slice(0, 200));
    const headers: Record<string, string> = {};
    if (secret) headers.Authorization = `Bearer ${secret}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 25_000);
    const res = await fetch(url, { method: "POST", body: form, headers, signal: ac.signal });
    clearTimeout(tid);
    if (res.ok) return null;
    const txt = await res.text().catch(() => "");
    return `Scan rejeitou o ficheiro (${res.status}): ${txt.slice(0, 200)}`;
  } catch (e) {
    return `Serviço de scan indisponível: ${String(e).slice(0, 200)}`;
  }
}

async function getSignedReadUrl(bucket: string, key: string, expiresInSeconds = 1800): Promise<string> {
  const client = getS3MediaClient();
  return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

async function getSignedReadUrlWithDeadline(
  bucket: string,
  key: string,
  ms: number,
): Promise<string | null> {
  try {
    return await Promise.race([
      getSignedReadUrl(bucket, key),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("presign timeout")), ms)),
    ]);
  } catch {
    return null;
  }
}

function publicUrlForS3Object(bucket: string, key: string): string {
  const base = Deno.env.get("MEDIA_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  const safeKey = key.replace(/^\//, "");
  return `${base}/${bucket}/${safeKey}`;
}

function S3_BUCKET_MESSAGE(): string {
  return Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
}

function S3_BUCKET_INBOX(): string {
  return Deno.env.get("S3_MEDIA_BUCKET_INBOX")?.trim() || "inbox-avatars";
}

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, accept-profile, prefer, range, x-supabase-api-version, baggage, sentry-trace",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function getAnonClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function supabasePublicObjectUrl(svc: SupabaseClient, bucket: string, path: string): string {
  const { data } = svc.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "FormData inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const kind = String(form.get("kind") ?? "").trim();
  const organizationId = String(form.get("organization_id") ?? "").trim();
  const file = form.get("file");

  if (!organizationId || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: "organization_id e file são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = getAnonClient(authHeader);
  const { data: userData, error: uErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (uErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const svc = getServiceClient();
  // Verificar membro com service role: o cliente anon + RLS por vezes não devolve a linha (ex. políticas / JWT edge),
  // causando 403 falso; o user.id vem do JWT validado em getUser().
  const { data: mem, error: memErr } = await svc
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (memErr) {
    console.error("[upload-media] organization_members check failed", memErr.message);
    return new Response(JSON.stringify({ error: "Falha ao validar acesso", detail: memErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!mem) {
    console.warn(
      "[upload-media] 403 not_org_member",
      JSON.stringify({ organization_id: organizationId, user_id_prefix: user.id.slice(0, 8) }),
    );
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (kind === "message") {
    const conversationId = String(form.get("conversation_id") ?? "").trim();
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversation_id é obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ct = (file.type || "application/octet-stream").split(";")[0].trim();
    const legacy = isLegacyModeFromEnv((k) => Deno.env.get(k));
    if (!isAllowedMessageMimeType(ct, legacy)) {
      return new Response(JSON.stringify({ error: "Tipo de ficheiro não permitido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const maxB = maxBytesForMessageMime(ct, legacy);
    if (file.size > maxB) {
      return new Response(
        JSON.stringify({
          error: `Ficheiro demasiado grande (máx. ${Math.round(maxB / (1024 * 1024))} MB para este tipo)`,
          max_bytes: maxB,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
    const path = `${organizationId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const magicErr = validateMessageFileMagic(ct, buf, legacy);
    if (magicErr) {
      return new Response(JSON.stringify({ error: magicErr }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const scanErr = await optionalExternalVirusScan(buf, file.name, ct);
    if (scanErr) {
      return new Response(JSON.stringify({ error: scanErr }), {
        status: 422,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const bucket = S3_BUCKET_MESSAGE();
    let url: string | undefined;
    let signed_url: string | null = null;

    if (s3MediaConfigured() && !s3EdgePutDisabled()) {
      try {
        await s3PutObjectWithRetry(bucket, path, buf, ct);
        url = publicUrlForS3Object(bucket, path);
        signed_url = await getSignedReadUrlWithDeadline(bucket, path, 12_000);
      } catch (e) {
        console.warn(
          "[upload-media] S3 falhou — fallback Storage",
          JSON.stringify({
            endpoint_host: s3EndpointHostForLog(),
            put_timeout_ms: s3PutTimeoutMs(),
            error: String(e),
            hint:
              "MinIO tem de ser HTTPS público a partir da internet (egress Supabase) ou defina secret S3_MEDIA_DISABLE_EDGE_PUT=true para gravar só em Storage sem este aviso.",
          }),
        );
      }
    }
    if (!url) {
      if (!s3MediaConfigured()) {
        console.warn(
          "[upload-media] S3_MEDIA_* não definidos nas secrets da função — a usar Supabase Storage (message-media). " +
            "Para MinIO: supabase secrets set S3_MEDIA_ENDPOINT ... (ver docs/SUPABASE_CLOUD_MINIO_SECRETS.md)",
        );
      }
      const sbBucket = "message-media";
      const { error: upErr } = await svc.storage.from(sbBucket).upload(path, buf, {
        contentType: ct,
        upsert: false,
      });
      if (upErr) {
        return new Response(JSON.stringify({ error: "Falha ao gravar no Storage", detail: upErr.message }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      url = supabasePublicObjectUrl(svc, sbBucket, path);
      signed_url = null;
    }

    return new Response(
      JSON.stringify({
        url,
        signed_url,
        path,
        mime_type: ct,
        file_name: file.name,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (kind === "inbox_avatar") {
    const channelId = String(form.get("channel_id") ?? "").trim();
    if (!channelId) {
      return new Response(JSON.stringify({ error: "channel_id é obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ct = file.type || "image/jpeg";
    if (!AVATAR_ALLOWED.has(ct)) {
      return new Response(JSON.stringify({ error: "Use imagem PNG, JPG, GIF ou WebP." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return new Response(JSON.stringify({ error: "Máximo 2 MB." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: ch } = await svc
      .from("channels")
      .select("id")
      .eq("id", channelId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!ch) {
      return new Response(JSON.stringify({ error: "Canal inválido" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().slice(0, 4) : "jpg";
    const extMap: Record<string, string> = { jpeg: "jpg", jpg: "jpg", png: "png", gif: "gif", webp: "webp" };
    const safeExt = extMap[ext] || "jpg";
    const path = `${organizationId}/${channelId}-${crypto.randomUUID()}.${safeExt}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const bucket = S3_BUCKET_INBOX();
    let url: string | undefined;
    let signed_url: string | null = null;

    if (s3MediaConfigured() && !s3EdgePutDisabled()) {
      try {
        await s3PutObjectWithRetry(bucket, path, buf, ct);
        url = publicUrlForS3Object(bucket, path);
        signed_url = await getSignedReadUrlWithDeadline(bucket, path, 12_000);
      } catch (e) {
        console.warn(
          "[upload-media] S3 falhou (avatar) — fallback Storage",
          JSON.stringify({
            endpoint_host: s3EndpointHostForLog(),
            put_timeout_ms: s3PutTimeoutMs(),
            error: String(e),
            hint: "Ou S3_MEDIA_DISABLE_EDGE_PUT=true se MinIO for inacessível da cloud.",
          }),
        );
      }
    }
    if (!url) {
      if (!s3MediaConfigured()) {
        console.warn("[upload-media] S3 não configurado — avatar em Supabase Storage (inbox-avatars)");
      }
      const sbBucket = "inbox-avatars";
      const { error: upErr } = await svc.storage.from(sbBucket).upload(path, buf, {
        contentType: ct,
        upsert: false,
      });
      if (upErr) {
        return new Response(JSON.stringify({ error: "Falha ao gravar avatar", detail: upErr.message }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      url = supabasePublicObjectUrl(svc, sbBucket, path);
      signed_url = null;
    }

    return new Response(JSON.stringify({ url, signed_url }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "kind inválido (use message ou inbox_avatar)" }), {
    status: 400,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
