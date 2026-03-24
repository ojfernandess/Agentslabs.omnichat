/**
 * Worker: processa fila webhook_ingest_jobs (Meta WhatsApp) após ACK rápido.
 * Agendar no Supabase: Edge Functions → Cron (ex. a cada 1 min) ou invocar via HTTP.
 *
 * Segredo: INTERNAL_HOOK_SECRET — mesmo das outras funções internas.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Token enviado pelo cliente: Bearer, x-internal-key ou apikey (útil para cron HTTP / pg_net). */
function readCallerCredential(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const xKey = req.headers.get("x-internal-key")?.trim() ?? null;
  const apikey = req.headers.get("apikey")?.trim() ?? null;
  return bearer || xKey || apikey || null;
}

function assertInternalAuth(req: Request): void {
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!secret || secret.length < 16) throw new Error("INTERNAL_HOOK_SECRET inválido");
  const token = readCallerCredential(req);
  if (!token) throw new Error("Não autorizado");
  if (token === secret) return;
  // Cron “Invoke Edge Function” / integrações podem enviar o JWT do service role em vez do segredo interno.
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && token === serviceRole) return;
  throw new Error("Não autorizado");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

function backoffIso(attempts: number): string {
  const sec = [10, 30, 60, 120, 300, 600, 1200, 3600][Math.min(attempts, 7)] ?? 3600;
  return new Date(Date.now() + sec * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    assertInternalAuth(req);
  } catch {
    console.warn(
      "[process-webhook-ingest] 401 — envie Authorization: Bearer <INTERNAL_HOOK_SECRET>, ou x-internal-key / apikey com o mesmo valor, ou Bearer <SUPABASE_SERVICE_ROLE_KEY> (cron Supabase).",
    );
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let batchSize = 25;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.batch_size === "number") {
        batchSize = Math.min(50, Math.max(1, body.batch_size));
      }
    }
  } catch {
    /* default */
  }

  const supabase = getServiceClient();
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!base || !secret) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL / INTERNAL_HOOK_SECRET em falta" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: jobs, error: claimErr } = await supabase.rpc("claim_webhook_ingest_jobs", {
    p_limit: batchSize,
  });

  if (claimErr) {
    console.error("claim_webhook_ingest_jobs", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rows = (jobs ?? []) as Array<{
    id: string;
    channel_id: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>;

  let processed = 0;
  let failed = 0;

  for (const job of rows) {
    const url = `${base}/functions/v1/meta-whatsapp-webhook?channel_id=${encodeURIComponent(job.channel_id)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _internal_process: true,
          payload: job.payload,
        }),
      });

      if (res.ok) {
        await supabase
          .from("webhook_ingest_jobs")
          .update({
            status: "done",
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        processed++;
        continue;
      }

      const errText = await res.text().catch(() => res.statusText);
      throw new Error(errText.slice(0, 500));
    } catch (e) {
      const msg = String(e);
      const attempts = job.attempts ?? 0;
      const max = job.max_attempts ?? 8;
      if (attempts >= max) {
        await supabase
          .from("webhook_ingest_jobs")
          .update({
            status: "dead",
            last_error: msg.slice(0, 2000),
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } else {
        await supabase
          .from("webhook_ingest_jobs")
          .update({
            status: "pending",
            last_error: msg.slice(0, 2000),
            next_attempt_at: backoffIso(attempts),
          })
          .eq("id", job.id);
      }
      failed++;
    }
  }

  return new Response(
    JSON.stringify({
      claimed: rows.length,
      processed,
      failed,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
