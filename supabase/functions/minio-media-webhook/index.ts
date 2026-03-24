/**
 * Webhook HTTP para notificações de bucket MinIO (ObjectCreated / ObjectRemoved).
 * Autenticação: Authorization: Bearer <MINIO_WEBHOOK_SECRET> ou INTERNAL_HOOK_SECRET.
 * Grava em public.media_object_events (auditoria).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function readCallerCredential(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const xKey = req.headers.get("x-internal-key")?.trim() ?? null;
  const apikey = req.headers.get("apikey")?.trim() ?? null;
  return bearer || xKey || apikey || null;
}

function assertWebhookAuth(req: Request): void {
  const minioSecret = Deno.env.get("MINIO_WEBHOOK_SECRET")?.trim();
  const internal = Deno.env.get("INTERNAL_HOOK_SECRET")?.trim();
  const token = readCallerCredential(req);
  if (!token) throw new Error("unauthorized");
  if (minioSecret && token === minioSecret) return;
  if (internal && token === internal && internal.length >= 16) return;
  throw new Error("unauthorized");
}

function extractS3Info(payload: unknown): { bucket?: string; key?: string; event?: string } {
  if (!payload || typeof payload !== "object") return {};
  const r = payload as Record<string, unknown>;

  if (typeof r.EventName === "string") {
    const key = typeof r.Key === "string"
      ? r.Key
      : typeof r.objectKey === "string"
      ? r.objectKey
      : undefined;
    const bucket = typeof r.Bucket === "string"
      ? r.Bucket
      : typeof r.bucket === "string"
      ? r.bucket
      : undefined;
    return { event: r.EventName, key, bucket };
  }

  const records = r.Records;
  if (Array.isArray(records) && records[0] && typeof records[0] === "object") {
    const rec = records[0] as Record<string, unknown>;
    const s3 = rec.s3 as Record<string, unknown> | undefined;
    const bucketObj = s3?.bucket as Record<string, unknown> | undefined;
    const obj = s3?.object as Record<string, unknown> | undefined;
    const rawKey = typeof obj?.key === "string" ? obj.key : undefined;
    const key = rawKey ? decodeURIComponent(rawKey.replace(/\+/g, " ")) : undefined;
    return {
      bucket: typeof bucketObj?.name === "string" ? bucketObj.name : undefined,
      key,
      event: typeof rec.eventName === "string" ? rec.eventName : undefined,
    };
  }

  if (typeof r.Message === "string") {
    try {
      return extractS3Info(JSON.parse(r.Message));
    } catch {
      /* ignore */
    }
  }

  return {};
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function organizationIdFromKey(key: string): string | null {
  const first = key.split("/").filter(Boolean)[0];
  if (first && UUID_PREFIX.test(first)) return first;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    assertWebhookAuth(req);
  } catch {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let raw: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) raw = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { bucket, key, event } = extractS3Info(raw);
  if (!key || !bucket) {
    console.warn("[minio-media-webhook] payload sem bucket/key reconhecíveis", JSON.stringify(raw).slice(0, 500));
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const orgId = organizationIdFromKey(key);

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("media_object_events").insert({
      bucket_name: bucket,
      object_key: key,
      event_type: event ?? null,
      organization_id: orgId,
      raw_payload: raw as Record<string, unknown>,
    });
    if (error) {
      console.error("[minio-media-webhook] insert", error.message);
      return new Response(JSON.stringify({ error: "Falha ao gravar evento", detail: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[minio-media-webhook]", String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, bucket, key }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
