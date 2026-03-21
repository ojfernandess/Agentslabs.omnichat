/** Monolítico — sem imports locais (deploy Supabase). */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertInternalAuth(req: Request): void {
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!secret || secret.length < 16) {
    throw new Error("INTERNAL_HOOK_SECRET inválido (mín. 16 caracteres)");
  }
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-internal-key");
  const token = bearer ?? header;
  if (token !== secret) {
    throw new Error("Não autorizado");
  }
}

async function signPlatformWebhook(
  secret: string,
  timestampSec: number,
  rawBody: string,
): Promise<{ signature: string; timestamp: string }> {
  const pre = `${timestampSec}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(pre),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { signature: `sha256=${hex}`, timestamp: String(timestampSec) };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function backoffSeconds(attemptIndex: number): number {
  const m = [0, 60, 300, 900, 3600];
  return m[Math.min(Math.max(attemptIndex, 0), m.length - 1)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    assertInternalAuth(req);
  } catch {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let batchSize = 30;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.batch_size === "number") batchSize = Math.min(100, Math.max(1, body.batch_size));
    }
  } catch {
    /* default */
  }

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("webhook_outbound_queue")
    .select(
      "id, organization_id, outbound_webhook_id, event_name, payload, delivery_id, attempts, max_attempts",
    )
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("webhook-dispatcher select", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let delivered = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const { data: hookRaw } = await supabase
      .from("outbound_webhooks")
      .select("url, secret, custom_headers, is_active")
      .eq("id", row.outbound_webhook_id)
      .maybeSingle();

    const hook = hookRaw as {
      url: string;
      secret: string;
      custom_headers: Record<string, string> | Record<string, unknown> | null;
      is_active: boolean;
    } | null;

    if (!hook?.is_active) {
      await supabase.from("webhook_outbound_queue").update({ status: "dead", last_error: "Webhook inativo" }).eq(
        "id",
        row.id,
      );
      continue;
    }

    const rawBody = JSON.stringify({
      ...(row.payload as Record<string, unknown>),
      delivery_id: row.delivery_id,
      event: row.event_name,
    });

    const ts = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = await signPlatformWebhook(hook.secret, ts, rawBody);

    const extra = (hook.custom_headers ?? {}) as Record<string, string>;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Platform-Webhooks/1.0",
      "X-Platform-Signature": signature,
      "X-Platform-Timestamp": timestamp,
      "X-Platform-Delivery": row.delivery_id,
      ...extra,
    };

    let httpStatus = 0;
    let errText = "";
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body: rawBody,
      });
      httpStatus = res.status;
      if (res.ok) {
        await supabase
          .from("webhook_outbound_queue")
          .update({ status: "delivered", last_http_status: httpStatus, last_error: null })
          .eq("id", row.id);
        await supabase
          .from("outbound_webhooks")
          .update({ last_delivery_status: "ok", last_delivery_at: new Date().toISOString() })
          .eq("id", row.outbound_webhook_id);
        delivered++;
        continue;
      }
      errText = await res.text().catch(() => "");
    } catch (e) {
      errText = String(e);
    }

    const attempts = (row.attempts as number) + 1;
    const max = (row.max_attempts as number) ?? 5;
    if (attempts >= max) {
      await supabase
        .from("webhook_outbound_queue")
        .update({
          status: "dead",
          attempts,
          last_http_status: httpStatus || null,
          last_error: errText.slice(0, 2000),
        })
        .eq("id", row.id);
      await supabase
        .from("outbound_webhooks")
        .update({ last_delivery_status: "failed", last_delivery_at: new Date().toISOString() })
        .eq("id", row.outbound_webhook_id);
      failed++;
      continue;
    }

    const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
    await supabase
      .from("webhook_outbound_queue")
      .update({
        attempts,
        next_attempt_at: next,
        last_http_status: httpStatus || null,
        last_error: errText.slice(0, 2000),
      })
      .eq("id", row.id);
    failed++;
  }

  return new Response(
    JSON.stringify({ processed: (rows ?? []).length, delivered, failed }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
