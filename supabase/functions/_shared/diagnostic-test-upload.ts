/**
 * Upload de imagem de teste (fluxo semelhante a upload-media) para validar S3/Storage nas Edge Functions.
 * Cópia INLINE em media-pipeline-diagnostic/index.ts — o deploy Supabase não empacota ../_shared.
 */
import { PutObjectCommand } from "npm:@aws-sdk/client-s3@3.654.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getS3MediaClient,
  publicUrlForS3Object,
  s3MediaConfigured,
  S3_BUCKET_MESSAGE,
} from "./s3-media.ts";

const MAX_BYTES = 2 * 1024 * 1024;
const PUT_TIMEOUT_MS = 25_000;

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function s3EdgePutDisabled(): boolean {
  const v = Deno.env.get("S3_MEDIA_DISABLE_EDGE_PUT")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function extFromMime(m: string): string {
  const x = m.toLowerCase();
  if (x.includes("png")) return "png";
  if (x.includes("webp")) return "webp";
  if (x.includes("gif")) return "gif";
  return "jpg";
}

function supabasePublicObjectUrl(svc: SupabaseClient, path: string): string {
  const { data } = svc.storage.from("message-media").getPublicUrl(path);
  return data.publicUrl;
}

export type DiagnosticImageUploadResult = {
  ok: boolean;
  path: string;
  url?: string;
  storage_backend?: "s3" | "supabase_storage";
  signed_url?: string | null;
  error?: string;
  duration_ms: number;
  /** Objeto não é apagado — pode validar no browser/MinIO; prefixo __diagnostic__/ */
  note?: string;
};

export async function runDiagnosticImageUpload(
  svc: SupabaseClient,
  organizationId: string,
  file: File,
): Promise<DiagnosticImageUploadResult> {
  const t0 = Date.now();
  const ct = (file.type || "").split(";")[0].trim().toLowerCase() || "application/octet-stream";

  if (!ct.startsWith("image/") || !ALLOWED_IMAGE.has(ct)) {
    return {
      ok: false,
      path: "",
      error: "Envie JPEG, PNG, GIF ou WebP.",
      duration_ms: Date.now() - t0,
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      path: "",
      error: "Máximo 2 MB para teste de diagnóstico.",
      duration_ms: Date.now() - t0,
    };
  }

  const ext =
    file.name && /\.(jpe?g|png|gif|webp)$/i.test(file.name)
      ? (file.name.split(".").pop() || extFromMime(ct)).toLowerCase().replace("jpeg", "jpg")
      : extFromMime(ct);
  const path = `${organizationId}/__diagnostic__/${crypto.randomUUID()}.${ext}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const bucket = S3_BUCKET_MESSAGE();

  if (s3MediaConfigured() && !s3EdgePutDisabled()) {
    try {
      const client = getS3MediaClient();
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), PUT_TIMEOUT_MS);
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
      /* fallback Storage abaixo */
      console.warn("[diagnostic-test-upload] S3 falhou — fallback Storage", String(e).slice(0, 200));
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
  const url = supabasePublicObjectUrl(svc, path);
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
