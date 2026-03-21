/**
 * Após resolver conversa com CSAT activo: marca custom_attributes, insere mensagem de sistema
 * e envia texto no WhatsApp (Graph) quando o canal for whatsapp.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MSG =
  "Obrigado pelo contacto! Como avalia o nosso atendimento? Responda apenas com um número de 1 a 5.";

function getAnonClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL / ANON_KEY");
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseCsat(settings: unknown): { enabled: boolean; message: string } {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { enabled: false, message: DEFAULT_MSG };
  }
  const s = settings as Record<string, unknown>;
  const csat = s.csat;
  if (!csat || typeof csat !== "object" || Array.isArray(csat)) {
    return { enabled: false, message: DEFAULT_MSG };
  }
  const c = csat as Record<string, unknown>;
  const msg = typeof c.message === "string" && c.message.trim() ? c.message.trim() : DEFAULT_MSG;
  return { enabled: Boolean(c.enabled), message: msg };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
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

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const convId = body.conversation_id?.trim();
  if (!convId) {
    return new Response(JSON.stringify({ error: "conversation_id obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = getAnonClient(authHeader);
  const { data: userData, error: uErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (uErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const svc = getServiceClient();

  const { data: conv, error: cErr } = await svc
    .from("conversations")
    .select("id, organization_id, channel_id, contact_id, status, custom_attributes")
    .eq("id", convId)
    .maybeSingle();

  if (cErr || !conv) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const orgId = conv.organization_id as string;

  const [{ data: orgRow }, { data: chRow }, { data: coRow }] = await Promise.all([
    svc.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
    svc.from("channels").select("channel_type, config").eq("id", conv.channel_id as string).maybeSingle(),
    svc.from("contacts").select("phone").eq("id", conv.contact_id as string).maybeSingle(),
  ]);

  const orgSettings = orgRow?.settings;
  const { data: mem } = await userClient
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!mem) {
    return new Response(JSON.stringify({ error: "Sem acesso" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const csat = parseCsat(orgSettings);
  if (!csat.enabled) {
    return new Response(JSON.stringify({ error: "CSAT desactivado nas configurações da organização" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if ((conv.status as string) !== "resolved") {
    return new Response(JSON.stringify({ error: "A conversa deve estar resolvida" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const text = csat.message;
  const sentAt = new Date().toISOString();
  const prev = (conv.custom_attributes ?? {}) as Record<string, unknown>;
  const nextAttrs = {
    ...prev,
    csat_pending: true,
    csat_sent_at: sentAt,
  };

  await svc.from("conversations").update({ custom_attributes: nextAttrs }).eq("id", convId);

  await svc.from("messages").insert({
    conversation_id: convId,
    sender_type: "system",
    message_type: "activity",
    content: text,
    metadata: { csat_survey: true },
  });

  const channelType = chRow?.channel_type as string | undefined;
  const phone = (coRow?.phone as string | null | undefined)?.trim();

  if (channelType === "whatsapp" && phone) {
    const config = (chRow?.config ?? {}) as Record<string, unknown>;
    const meta = (config.meta ?? {}) as Record<string, unknown>;
    const phoneNumberId = String(meta.phone_number_id ?? "");
    const accessToken = String(meta.access_token ?? "");
    if (phoneNumberId && accessToken) {
      const version = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
      const graphUrl = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
      const waTo = phone.replace(/\D/g, "");
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
        return new Response(JSON.stringify({ error: "Falha ao enviar WhatsApp", detail: resJson }), {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, channel: "whatsapp", graph: resJson }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      channel: channelType ?? "unknown",
      note: "Mensagem registada na conversa; envio directo ao canal apenas para WhatsApp configurado.",
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
