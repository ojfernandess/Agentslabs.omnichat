/**
 * Entrega mensagem do atendente ao canal externo (WhatsApp Meta/Evolution).
 * Chamado pelo frontend após insert em messages (message_type=outgoing).
 *
 * Fluxo: ConversationsPage insert → invoke esta função → POST para send-whatsapp.
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

  let body: { conversation_id?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { conversation_id, content } = body;
  if (!conversation_id || typeof content !== "string") {
    return new Response(JSON.stringify({ error: "conversation_id e content são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return new Response(JSON.stringify({ error: "content não pode ser vazio" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: convo, error: convoErr } = await supabase
    .from("conversations")
    .select("organization_id, channel_id, contact_id")
    .eq("id", conversation_id)
    .maybeSingle();

  if (convoErr || !convo) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", convo.organization_id)
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
    .eq("id", convo.channel_id)
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (channel.channel_type !== "whatsapp") {
    return new Response(JSON.stringify({ ok: true, message: "Canal não é WhatsApp, envio ignorado" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", convo.contact_id)
    .maybeSingle();

  if (contactErr || !contact?.phone) {
    return new Response(JSON.stringify({ error: "Contacto sem número de telefone" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!baseUrl || !secret) {
    return new Response(JSON.stringify({ error: "Configuração interna incompleta" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const sendWhatsAppUrl = `${baseUrl}/functions/v1/send-whatsapp`;
  const res = await fetch(sendWhatsAppUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      channel_id: channel.id,
      to: contact.phone,
      text: trimmed,
    }),
  });

  const resJson = await res.json().catch(() => ({}));

  if (!res.ok) {
    return new Response(
      JSON.stringify({
        error: resJson?.error ?? "Falha ao enviar para WhatsApp",
        detail: resJson,
      }),
      {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true, ...resJson }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
