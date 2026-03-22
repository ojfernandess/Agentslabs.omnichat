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

  let body: { channel_id?: string; to?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { channel_id, to, text } = body;
  if (!channel_id || !to || !text) {
    return new Response(JSON.stringify({ error: "channel_id, to e text são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, organization_id, config")
    .eq("id", channel_id)
    .eq("channel_type", "whatsapp")
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const config = (channel.config ?? {}) as Record<string, unknown>;
  const provider = String(config.whatsapp_provider ?? config.whatsappProvider ?? "meta");
  const evolution = (config.evolution ?? {}) as Record<string, unknown>;
  // Fallback para config em formato flat (ex.: evolution_base_url no topo)
  const baseUrlRaw =
    evolution.base_url ?? evolution.baseUrl ?? config.evolution_base_url ?? config.evolution_baseUrl ?? "";
  const apiKeyRaw =
    evolution.api_key ?? evolution.apiKey ?? config.evolution_api_key ?? config.evolution_apiKey ?? "";
  const instanceNameRaw =
    evolution.instance_name ?? evolution.instanceName ?? config.evolution_instance_name ?? config.evolution_instanceName ?? "";

  const waTo = to.replace(/\D/g, "");

  if (provider === "evolution" || (baseUrlRaw && instanceNameRaw)) {
    const baseUrl = String(baseUrlRaw).replace(/\/$/, "");
    const apiKey = String(apiKeyRaw);
    const instanceName = String(instanceNameRaw).trim();
    if (!baseUrl || !apiKey || !instanceName) {
      return new Response(
        JSON.stringify({ error: "Evolution: defina config.evolution.base_url, api_key e instance_name" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const sendUrl = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
    const res = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: waTo,
        text,
      }),
    });
    const resJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Evolution API", detail: resJson }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, evolution: resJson }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const meta = (config.meta ?? {}) as Record<string, unknown>;
  const phoneNumberId = String(meta.phone_number_id ?? meta.phoneNumberId ?? "");
  const accessToken = String(meta.access_token ?? meta.accessToken ?? "");
  if (!phoneNumberId || !accessToken) {
    const hint =
      provider === "meta"
        ? "phone_number_id e access_token devem estar em config.meta (Meta/WhatsApp Business)."
        : "Canal sem configuração válida. Se usa Evolution API: em Canais/Caixas, edite a caixa e defina Evolution API (base_url, api_key, instance_name). Se usa Meta: defina config.meta.phone_number_id e access_token.";
    return new Response(JSON.stringify({ error: hint }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const version = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
  const graphUrl = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const res = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: waTo,
      type: "text",
      text: { body: text },
    }),
  });

  const resJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Graph API", detail: resJson }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, graph: resJson }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
