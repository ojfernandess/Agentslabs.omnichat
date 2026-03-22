/**
 * Armazenamento S3-compatible (MinIO no Easypanel) — FONTE DE REFERÊNCIA.
 * O deploy cloud NÃO empacota este ficheiro; a mesma lógica está INLINE em:
 * process-media, upload-media, evolution-whatsapp-webhook, meta-whatsapp-webhook (index.ts).
 */
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

export function s3MediaConfigured(): boolean {
  return Boolean(
    Deno.env.get("S3_MEDIA_ENDPOINT")?.trim() &&
      Deno.env.get("S3_MEDIA_ACCESS_KEY")?.trim() &&
      Deno.env.get("S3_MEDIA_SECRET_KEY")?.trim() &&
      Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim(),
  );
}

let _client: S3Client | null = null;

export function getS3MediaClient(): S3Client {
  if (_client) return _client;
  const endpoint = Deno.env.get("S3_MEDIA_ENDPOINT")!.trim();
  const region = Deno.env.get("S3_MEDIA_REGION")?.trim() || "us-east-1";
  const forcePathStyle = Deno.env.get("S3_MEDIA_FORCE_PATH_STYLE") !== "false";
  _client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: Deno.env.get("S3_MEDIA_ACCESS_KEY")!.trim(),
      secretAccessKey: Deno.env.get("S3_MEDIA_SECRET_KEY")!.trim(),
    },
    forcePathStyle,
  });
  return _client;
}

export async function s3PutObject(
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

/** URL pública: MEDIA_PUBLIC_BASE_URL + /bucket/key (ex.: https://cdn.../message-media/org/...) */
export function publicUrlForS3Object(bucket: string, key: string): string {
  const base = Deno.env.get("MEDIA_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  const safeKey = key.replace(/^\//, "");
  return `${base}/${bucket}/${safeKey}`;
}

export const S3_BUCKET_MESSAGE = () => Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
export const S3_BUCKET_INBOX = () => Deno.env.get("S3_MEDIA_BUCKET_INBOX")?.trim() || "inbox-avatars";
