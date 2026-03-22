/**
 * Thumbnail + compressão JPEG (ImageScript — compatível com Deno Edge).
 * Sharp é nativo Node e não corre em Edge Functions; use scripts/sharp-media.mjs localmente se precisar de Sharp.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

/** S3/MinIO — código inline (o bundle remoto não inclui ../_shared). Manter em sync com _shared/s3-media.ts */
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

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getAnonClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL / ANON_KEY");
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function base64ToBytes(dataUrlOrB64: string): Uint8Array {
  const base64 = dataUrlOrB64.includes(",") ? dataUrlOrB64.split(",")[1]! : dataUrlOrB64;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
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

  let body: { organization_id?: string; image_base64?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const orgId = body.organization_id?.trim();
  const b64 = body.image_base64?.trim();
  if (!orgId || !b64) {
    return new Response(JSON.stringify({ error: "organization_id e image_base64 são obrigatórios" }), {
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
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!mem) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return new Response(JSON.stringify({ error: "Base64 inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (bytes.length > 6 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "Imagem demasiado grande (máx. 6MB)" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let img: InstanceType<typeof Image>;
  try {
    img = await Image.decode(bytes);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Formato de imagem não suportado", detail: String(e) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const maxW = 1200;
  const maxThumb = 240;
  let main = img;
  if (main.width > maxW) {
    const scale = maxW / main.width;
    const nh = Math.max(1, Math.round(main.height * scale));
    main = main.resize(maxW, nh);
  }
  const compressed = await main.encodeJPEG(82);

  let thumbImg = await Image.decode(compressed);
  if (thumbImg.width > maxThumb) {
    const scale = maxThumb / thumbImg.width;
    const nh = Math.max(1, Math.round(thumbImg.height * scale));
    thumbImg = thumbImg.resize(maxThumb, nh);
  }
  const thumbnail = await thumbImg.encodeJPEG(78);

  const id = crypto.randomUUID();
  const base = `${orgId}/${id}`;
  const svc = getServiceClient();
  const bucket = S3_BUCKET_MESSAGE();
  const fullKey = `${base}_full.jpg`;
  const thumbKey = `${base}_thumb.jpg`;

  if (s3MediaConfigured()) {
    try {
      await s3PutObject(bucket, fullKey, compressed, "image/jpeg");
      await s3PutObject(bucket, thumbKey, thumbnail, "image/jpeg");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Falha ao gravar imagem (S3)", detail: String(e) }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        full_path: fullKey,
        thumb_path: thumbKey,
        full_url: publicUrlForS3Object(bucket, fullKey),
        thumb_url: publicUrlForS3Object(bucket, thumbKey),
        width: main.width,
        height: main.height,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const { error: up1 } = await svc.storage.from("message-media").upload(fullKey, compressed, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (up1) {
    return new Response(JSON.stringify({ error: "Falha ao gravar imagem", detail: up1.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { error: up2 } = await svc.storage.from("message-media").upload(thumbKey, thumbnail, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (up2) {
    return new Response(JSON.stringify({ error: "Falha ao gravar thumbnail", detail: up2.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const pub = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  const sbBucket = "message-media";

  return new Response(
    JSON.stringify({
      full_path: fullKey,
      thumb_path: thumbKey,
      full_url: `${pub}/storage/v1/object/public/${sbBucket}/${fullKey}`,
      thumb_url: `${pub}/storage/v1/object/public/${sbBucket}/${thumbKey}`,
      width: main.width,
      height: main.height,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
