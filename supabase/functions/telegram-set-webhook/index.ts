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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { channel_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const channelId = body.channel_id;
  if (!channelId) {
    return new Response(JSON.stringify({ error: "channel_id obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const { data: channel, error } = await supabase
    .from("channels")
    .select("id, config, channel_type")
    .eq("id", channelId)
    .eq("channel_type", "telegram")
    .maybeSingle();

  if (error || !channel) {
    return new Response(JSON.stringify({ error: "Canal Telegram não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const config = (channel.config ?? {}) as Record<string, unknown>;
  const tg = (config.telegram ?? {}) as Record<string, unknown>;
  const botToken = String(tg.bot_token ?? "");
  if (!botToken) {
    return new Response(JSON.stringify({ error: "config.telegram.bot_token ausente" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!base) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL ausente" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const webhookUrl = `${base}/functions/v1/telegram-webhook?channel_id=${channelId}`;
  const tgSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const url = new URL(`https://api.telegram.org/bot${botToken}/setWebhook`);
  url.searchParams.set("url", webhookUrl);
  if (tgSecret) url.searchParams.set("secret_token", tgSecret);

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => ({}));

  return new Response(JSON.stringify({ ok: res.ok, telegram: json, webhook_url: webhookUrl }), {
    status: res.ok ? 200 : 502,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
