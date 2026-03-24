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

/**
 * Valida o JWT do utilizador. Preferir cliente anon + Authorization (como o browser);
 * `service.auth.getUser(jwt)` pode falhar com alguns JWT (ex.: ES256) nas Edge Functions.
 */
async function resolveUserFromJwt(jwt: string): Promise<{ id: string } | null> {
  const clean = jwt.trim();
  if (!clean) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (url && anon) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${clean}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (!error && user) return user;
    if (error) console.error("[send-outbound-message] getUser (anon client)", error.message);
  }
  const svc = getServiceClient();
  const { data: { user }, error } = await svc.auth.getUser(clean);
  if (!error && user) return user;
  if (error) console.error("[send-outbound-message] getUser (service)", error.message);
  return null;
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

  const token = authHeader.slice(7).trim();
  const supabase = getServiceClient();
  const internalSecret = Deno.env.get("INTERNAL_HOOK_SECRET");
  const isInternal = internalSecret && token === internalSecret;

  let body: {
    conversation_id?: string;
    content?: string;
    content_type?: string;
    attachment_url?: string;
    attachment_mime_type?: string;
    attachment_file_name?: string;
    template?: { name: string; language?: string; body_parameters?: string[] };
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { conversation_id, content, content_type, attachment_url, attachment_mime_type, attachment_file_name, template } = body;

  if (!isInternal) {
    const user = await resolveUserFromJwt(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: convo } = await supabase
      .from("conversations")
      .select("organization_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!convo) {
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
  }
  if (!conversation_id) {
    return new Response(JSON.stringify({ error: "conversation_id é obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const isText = content_type !== "audio" && content_type !== "template";
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (isText && !trimmed && !attachment_url && !template) {
    return new Response(JSON.stringify({ error: "content, attachment_url ou template são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (content_type === "audio" && !attachment_url) {
    return new Response(JSON.stringify({ error: "attachment_url é obrigatório para áudio" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (
    (content_type === "image" || content_type === "video" || content_type === "document") &&
    !attachment_url?.trim()
  ) {
    return new Response(
      JSON.stringify({
        error: "attachment_url é obrigatório para imagem, vídeo ou documento (URL pública acessível pelo provedor, como no Chatwoot)",
      }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
  if (content_type === "template" && !template?.name) {
    return new Response(JSON.stringify({ error: "template.name é obrigatório" }), {
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
  const payload: Record<string, unknown> = {
    channel_id: channel.id,
    to: contact.phone,
    text: trimmed || undefined,
    content_type: content_type ?? "text",
    attachment_url: attachment_url ?? undefined,
    attachment_mime_type: attachment_mime_type ?? undefined,
    attachment_file_name: attachment_file_name ?? undefined,
    template: template ?? undefined,
  };
  const res = await fetch(sendWhatsAppUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
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
