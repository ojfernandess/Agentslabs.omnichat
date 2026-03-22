/**
 * Upload de mídia (mensagens + avatar inbox) para S3/MinIO (Easypanel) em vez do Supabase Storage.
 * Requer secrets: S3_MEDIA_*, MEDIA_PUBLIC_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

/** S3/MinIO — inline para deploy remoto (não usar ../_shared). Manter em sync com _shared/s3-media.ts */
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

async function s3PutObject(
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = getS3MediaClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const ALLOWED_MESSAGE = new Set([
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!s3MediaConfigured()) {
    return new Response(
      JSON.stringify({
        error: "S3/MinIO não configurado",
        detail: "Defina S3_MEDIA_ENDPOINT, S3_MEDIA_ACCESS_KEY, S3_MEDIA_SECRET_KEY e MEDIA_PUBLIC_BASE_URL",
      }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

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

  const { data: mem } = await userClient
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!mem) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const svc = getServiceClient();

  if (kind === "message") {
    const conversationId = String(form.get("conversation_id") ?? "").trim();
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversation_id é obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ct = file.type || "application/octet-stream";
    if (!ct.startsWith("image/") && !ALLOWED_MESSAGE.has(ct)) {
      return new Response(JSON.stringify({ error: "Tipo de ficheiro não permitido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_MESSAGE_BYTES) {
      return new Response(JSON.stringify({ error: "Ficheiro demasiado grande (máx. 10 MB)" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
    const path = `${organizationId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const bucket = S3_BUCKET_MESSAGE();
    const buf = new Uint8Array(await file.arrayBuffer());
    await s3PutObject(bucket, path, buf, ct);

    const url = publicUrlForS3Object(bucket, path);
    return new Response(
      JSON.stringify({
        url,
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
    const bucket = S3_BUCKET_INBOX();
    const buf = new Uint8Array(await file.arrayBuffer());
    await s3PutObject(bucket, path, buf, ct);

    const url = publicUrlForS3Object(bucket, path);
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "kind inválido (use message ou inbox_avatar)" }), {
    status: 400,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
