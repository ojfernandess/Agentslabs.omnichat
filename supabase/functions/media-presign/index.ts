/**
 * Gera URL pré-assinada PUT para upload directo ao MinIO (mensagens grandes).
 * Requer S3_MEDIA_* + JWT de utilizador + membership na organização.
 * O cliente deve fazer PUT com o mesmo Content-Type enviado aqui.
 *
 * Política INLINE — o bundle remoto do Supabase não inclui ../_shared.
 * Manter em sync com _shared/media-upload-policy.ts e upload-media/index.ts.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";
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
  if (ct === "image/jpeg" || ct === "image/png" || ct === "image/webp" || ct === "application/pdf") {
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

function s3MediaConfigured(): boolean {
  return Boolean(
    Deno.env.get("S3_MEDIA_ENDPOINT")?.trim() &&
      Deno.env.get("S3_MEDIA_ACCESS_KEY")?.trim() &&
      Deno.env.get("S3_MEDIA_SECRET_KEY")?.trim() &&
      Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim(),
  );
}

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (_s3) return _s3;
  const endpoint = Deno.env.get("S3_MEDIA_ENDPOINT")!.trim();
  const region = Deno.env.get("S3_MEDIA_REGION")?.trim() || "us-east-1";
  const forcePathStyle = Deno.env.get("S3_MEDIA_FORCE_PATH_STYLE") !== "false";
  _s3 = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: Deno.env.get("S3_MEDIA_ACCESS_KEY")!.trim(),
      secretAccessKey: Deno.env.get("S3_MEDIA_SECRET_KEY")!.trim(),
    },
    forcePathStyle,
  });
  return _s3;
}

function bucketMessage(): string {
  return Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
}

function publicUrlForObject(bucket: string, key: string): string {
  const base = Deno.env.get("MEDIA_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  return `${base}/${bucket}/${key.replace(/^\//, "")}`;
}

function presignPutExpiresSec(): number {
  const raw = Deno.env.get("MEDIA_PRESIGN_PUT_EXPIRES_SEC")?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 60 && n <= 3600) return n;
  return 900;
}

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

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST JSON" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!s3MediaConfigured()) {
    return new Response(
      JSON.stringify({
        error: "Presign indisponível",
        detail: "Configure S3_MEDIA_* e MEDIA_PUBLIC_BASE_URL ou use upload-media multipart.",
      }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const organizationId = String(body.organization_id ?? "").trim();
  const conversationId = String(body.conversation_id ?? "").trim();
  const contentType = String(body.content_type ?? body.mime_type ?? "").trim();
  const fileSize = typeof body.file_size === "number" ? body.file_size : parseInt(String(body.file_size ?? ""), 10);
  const fileName = String(body.file_name ?? "upload.bin").trim().slice(0, 200);

  if (!organizationId || !conversationId || !contentType || !Number.isFinite(fileSize) || fileSize < 1) {
    return new Response(JSON.stringify({ error: "organization_id, conversation_id, content_type, file_size obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const legacy = isLegacyModeFromEnv((k) => Deno.env.get(k));
  if (!isAllowedMessageMimeType(contentType, legacy)) {
    return new Response(JSON.stringify({ error: "Tipo de ficheiro não permitido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const maxB = maxBytesForMessageMime(contentType, legacy);
  if (fileSize > maxB) {
    return new Response(
      JSON.stringify({ error: "Ficheiro demasiado grande para este tipo", max_bytes: maxB }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
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
  const { data: mem, error: memErr } = await svc
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (memErr) {
    return new Response(JSON.stringify({ error: "Falha ao validar acesso", detail: memErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!mem) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ext = fileName.includes(".") ? fileName.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "bin";
  const key = `${organizationId}/${conversationId}/${crypto.randomUUID()}.${ext || "bin"}`;
  const bucket = bucketMessage();
  const ct = contentType.split(";")[0].trim();
  const expiresIn = presignPutExpiresSec();

  try {
    const client = getS3();
    const putUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: ct,
      }),
      { expiresIn },
    );

    return new Response(
      JSON.stringify({
        method: "PUT",
        url: putUrl,
        headers: { "Content-Type": ct },
        key,
        bucket,
        public_url: publicUrlForObject(bucket, key),
        expires_in: expiresIn,
        file_name: fileName,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[media-presign]", String(e));
    return new Response(JSON.stringify({ error: "Falha ao gerar URL assinada", detail: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
