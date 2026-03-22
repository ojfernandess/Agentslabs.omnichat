/**
 * API pública para o chat do widget Live Chat (visitantes).
 * Valida acesso via public_token do canal.
 *
 * GET ?token=xxx&conversation_id=xxx → retorna mensagens
 * POST { token, conversation_id?, content?, prechat? } → init ou envia mensagem
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonErr("Configuração incompleta", 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function jsonErr(msg: string, status: number) {
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Validar canal pelo token
  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, organization_id, channel_type")
    .eq("public_token", token)
    .eq("channel_type", "livechat")
    .eq("is_active", true)
    .maybeSingle();

  if (chErr || !channel) {
    return jsonErr("Canal não encontrado ou inativo", 404);
  }

  if (req.method === "GET") {
    const conversationId = url.searchParams.get("conversation_id")?.trim();
    if (!conversationId) {
      return jsonErr("conversation_id é obrigatório", 400);
    }

    // Garantir que a conversa pertence ao canal
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, channel_id")
      .eq("id", conversationId)
      .eq("channel_id", channel.id)
      .maybeSingle();

    if (convoErr || !convo) {
      return jsonErr("Conversa não encontrada", 404);
    }

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("id, content, message_type, sender_type, created_at")
      .eq("conversation_id", conversationId)
      .neq("message_type", "note")
      .order("created_at", { ascending: true });

    if (msgErr) {
      return jsonErr("Erro ao buscar mensagens", 500);
    }

    return new Response(
      JSON.stringify({ messages: messages ?? [] }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  if (req.method === "POST") {
    let body: {
      token?: string;
      conversation_id?: string;
      content?: string;
      prechat?: Record<string, string>;
    };
    try {
      body = await req.json();
    } catch {
      return jsonErr("JSON inválido", 400);
    }

    const conversationId = body.conversation_id?.trim();
    const content = body.content?.trim();
    const prechat = body.prechat ?? {};

    let convoId = conversationId;

    if (!convoId) {
      // Inicializar: criar ou reutilizar contact + conversation
      const name = prechat.fullName ?? prechat.name ?? prechat.emailAddress ?? "Visitante";
      const email = prechat.emailAddress ?? prechat.email ?? null;
      const phone = prechat.phoneNumber ?? prechat.phone ?? null;

      let contactId: string | null = null;

      if (email?.trim()) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", channel.organization_id)
          .eq("email", email.trim())
          .limit(1)
          .maybeSingle();
        if (existing) {
          contactId = existing.id;
          const updatePayload: Record<string, unknown> = {
            name: name || "Visitante",
            updated_at: new Date().toISOString(),
          };
          if (phone != null) updatePayload.phone = phone;
          if (Object.keys(prechat).length > 0) updatePayload.custom_fields = prechat;
          await supabase.from("contacts").update(updatePayload).eq("id", existing.id);
        }
      }

      if (!contactId) {
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .insert({
            organization_id: channel.organization_id,
            name: name || "Visitante",
            email: email || null,
            phone: phone || null,
            custom_fields: Object.keys(prechat).length ? prechat : {},
          })
          .select("id")
          .single();

        if (contactErr || !contact) {
          console.error("widget-chat contact insert:", contactErr);
          return jsonErr("Erro ao criar contato", 500);
        }
        contactId = contact.id;
      }

      const { data: existingConvo } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("channel_id", channel.id)
        .in("status", ["open", "pending"])
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConvo) {
        convoId = existingConvo.id;
      } else {
        const { data: newConvo, error: convoErr } = await supabase
          .from("conversations")
          .insert({
            organization_id: channel.organization_id,
            contact_id: contactId,
            channel_id: channel.id,
            status: "open",
          })
          .select("id")
          .single();

        if (convoErr || !newConvo) {
          console.error("widget-chat conversation insert:", convoErr);
          return jsonErr("Erro ao criar conversa", 500);
        }
        convoId = newConvo.id;
      }

      if (content) {
        await supabase.from("messages").insert({
          conversation_id: convoId,
          sender_type: "Contact",
          sender_id: contactId,
          message_type: "incoming",
          content,
          content_type: "text",
        });
      }

      return new Response(
        JSON.stringify({ conversation_id: convoId }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Enviar mensagem
    if (!content) {
      return jsonErr("content é obrigatório", 400);
    }

    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, contact_id")
      .eq("id", convoId)
      .eq("channel_id", channel.id)
      .maybeSingle();

    if (convoErr || !convo) {
      return jsonErr("Conversa não encontrada", 404);
    }

    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: convoId,
      sender_type: "Contact",
      sender_id: convo.contact_id,
      message_type: "incoming",
      content,
      content_type: "text",
    });

    if (msgErr) {
      return jsonErr("Erro ao enviar mensagem", 500);
    }

    return new Response(
      JSON.stringify({ conversation_id: convoId }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  return jsonErr("Método não permitido", 405);
});
