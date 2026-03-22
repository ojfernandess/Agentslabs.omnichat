/**
 * Obtém foto de perfil WhatsApp via Evolution API e opcionalmente atualiza o contacto.
 * Chamado pelo frontend ao exibir o painel de contacto em conversas WhatsApp.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getEvolutionConfig(config: Record<string, unknown>) {
  const provider = String(config.whatsapp_provider ?? config.whatsappProvider ?? "meta");
  const evolution = (config.evolution ?? {}) as Record<string, unknown>;
  const baseUrlRaw =
    evolution.base_url ?? evolution.baseUrl ?? config.evolution_base_url ?? config.evolution_baseUrl ?? "";
  const apiKeyRaw =
    evolution.api_key ?? evolution.apiKey ?? config.evolution_api_key ?? config.evolution_apiKey ?? "";
  const instanceNameRaw =
    evolution.instance_name ?? evolution.instanceName ??
    config.evolution_instance_name ?? config.evolution_instanceName ?? "";
  const baseUrl = String(baseUrlRaw).replace(/\/$/, "");
  const apiKey = String(apiKeyRaw);
  const instanceName = String(instanceNameRaw).trim();
  const useEvolution = provider === "evolution" || (baseUrl && instanceName);
  return useEvolution ? { baseUrl, apiKey, instanceName } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
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

  const token = authHeader.slice(7);
  const supabase = getServiceClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { contact_id?: string; channel_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { contact_id, channel_id } = body;
  if (!contact_id || !channel_id) {
    return new Response(JSON.stringify({ error: "contact_id e channel_id são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, organization_id, phone")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactErr || !contact?.phone) {
    return new Response(JSON.stringify({ error: "Contacto não encontrado ou sem telefone" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", contact.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, channel_type, config")
    .eq("id", channel_id)
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (channel.channel_type !== "whatsapp") {
    return new Response(
      JSON.stringify({ ok: true, profilePictureUrl: null, wuid: null, message: "Canal não é WhatsApp" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const evo = getEvolutionConfig((channel.config ?? {}) as Record<string, unknown>);
  if (!evo) {
    return new Response(
      JSON.stringify({ ok: true, profilePictureUrl: null, wuid: null, message: "Canal não usa Evolution API" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const remoteJid = contact.phone.replace(/\D/g, "") + "@s.whatsapp.net";
  const fetchUrl = `${evo.baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(evo.instanceName)}`;

  const res = await fetch(fetchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evo.apiKey,
    },
    body: JSON.stringify({ number: remoteJid }),
  });

  const resJson = (await res.json().catch(() => ({}))) as { profilePictureUrl?: string; wuid?: string };

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "Evolution API", detail: resJson }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const profilePictureUrl = resJson.profilePictureUrl ?? null;
  const wuid = resJson.wuid ?? remoteJid;

  if (profilePictureUrl) {
    await supabase
      .from("contacts")
      .update({ avatar_url: profilePictureUrl })
      .eq("id", contact_id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      profilePictureUrl,
      wuid,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
