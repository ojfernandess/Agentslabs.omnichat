/**
 * Worker de campanhas: processa campaign_send_jobs com rate limit (não dispara tudo na Edge).
 * Invocar por cron (ex. 1/min). Popular campaign_send_jobs com fan-out SQL ou função dedicada.
 *
 * Variáveis:
 * - INTERNAL_HOOK_SECRET
 * - CAMPAIGN_SEND_PER_SECOND (default 5) — mensagens/s por organização (ficar abaixo dos limites Meta)
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
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && token === serviceRole) return;
  throw new Error("Não autorizado");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    assertInternalAuth(req);
  } catch {
    console.warn(
      "[campaign-worker] 401 — use Authorization: Bearer <INTERNAL_HOOK_SECRET>, ou x-internal-key / apikey, ou Bearer <SUPABASE_SERVICE_ROLE_KEY>.",
    );
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const perSecond = Math.max(
    1,
    Math.min(80, Number(Deno.env.get("CAMPAIGN_SEND_PER_SECOND") ?? "5") || 5),
  );
  const gapMs = Math.ceil(1000 / perSecond);

  let orgLimit = 10;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.batch_per_org === "number") {
        orgLimit = Math.min(50, Math.max(1, body.batch_per_org));
      }
    }
  } catch {
    /* default */
  }

  const supabase = getServiceClient();
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!base || !secret) {
    return new Response(JSON.stringify({ error: "Config em falta" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: jobs, error } = await supabase
    .from("campaign_send_jobs")
    .select("id, channel_id, phone, message_body, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(orgLimit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rows = jobs ?? [];
  let sent = 0;
  let failed = 0;

  for (const job of rows) {
    if (!job.channel_id) {
      await supabase
        .from("campaign_send_jobs")
        .update({
          status: "dead",
          last_error: "channel_id em falta no job",
        })
        .eq("id", job.id);
      failed++;
      continue;
    }

    await supabase.from("campaign_send_jobs").update({ status: "processing" }).eq("id", job.id);

    const sendUrl = `${base}/functions/v1/send-whatsapp`;
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel_id: job.channel_id,
          to: job.phone,
          text: job.message_body,
        }),
      });

      if (res.ok) {
        await supabase
          .from("campaign_send_jobs")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        sent++;
      } else {
        const t = await res.text().catch(() => "");
        throw new Error(t.slice(0, 500));
      }
    } catch (e) {
      const attempts = (job.attempts ?? 0) + 1;
      const max = job.max_attempts ?? 5;
      const next = new Date(Date.now() + Math.min(3600, 30 * attempts) * 1000).toISOString();
      if (attempts >= max) {
        await supabase
          .from("campaign_send_jobs")
          .update({
            status: "dead",
            last_error: String(e).slice(0, 2000),
          })
          .eq("id", job.id);
      } else {
        await supabase
          .from("campaign_send_jobs")
          .update({
            status: "pending",
            attempts,
            last_error: String(e).slice(0, 2000),
            next_attempt_at: next,
          })
          .eq("id", job.id);
      }
      failed++;
    }

    await new Promise((r) => setTimeout(r, gapMs));
  }

  return new Response(
    JSON.stringify({ picked: rows.length, sent, failed, rate_per_second: perSecond }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
