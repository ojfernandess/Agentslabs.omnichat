/**
 * Teste de escrita S3/MinIO a partir das Edge Functions (mesmo caminho que upload-media).
 * Cópia INLINE em media-pipeline-diagnostic/index.ts — o deploy Supabase não empacota ../_shared.
 */
import { DeleteObjectCommand, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.654.0";
import { getS3MediaClient, s3MediaConfigured, S3_BUCKET_MESSAGE } from "./s3-media.ts";

export type S3WriteProbeResult =
  | { ran: false; skipped_reason: string }
  | {
      ran: true;
      ok: boolean;
      endpoint_host: string;
      bucket: string;
      probe_key: string;
      put_ms?: number;
      delete_ms?: number;
      delete_failed?: string;
      error?: string;
    };

const PROBE_TIMEOUT_MS = 20_000;

function endpointHostForLog(): string {
  try {
    const u = Deno.env.get("S3_MEDIA_ENDPOINT")?.trim();
    if (!u) return "";
    return new URL(u).host;
  } catch {
    return "?";
  }
}

/** PUT + DELETE de 2 bytes no bucket message-media — valida credenciais, rede e permissões desde a cloud Supabase. */
export async function runS3WriteProbeFromEdge(): Promise<S3WriteProbeResult> {
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

  const tPut = Date.now();
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
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
      endpoint_host: endpointHostForLog(),
      bucket,
      probe_key: probeKey,
      put_ms: Date.now() - tPut,
      error: String(e).slice(0, 400),
    };
  }

  const put_ms = Date.now() - tPut;
  const tDel = Date.now();
  let delete_failed: string | undefined;
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
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
    endpoint_host: endpointHostForLog(),
    bucket,
    probe_key: probeKey,
    put_ms,
    delete_ms,
    ...(delete_failed ? { delete_failed } : {}),
  };
}
