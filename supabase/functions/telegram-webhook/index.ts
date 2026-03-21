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

async function enqueueOutboundForEvent(
  supabase: SupabaseClient,
  organizationId: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: hooks, error } = await supabase
    .from("outbound_webhooks")
    .select("id, organization_id, events")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.error("enqueueOutboundForEvent list error", error);
    return;
  }

  const matched = (hooks ?? []).filter((h) => (h.events as string[] | null)?.includes(eventName));
  if (!matched.length) return;

  const deliveryRows = matched.map((h) => ({
    organization_id: organizationId,
    outbound_webhook_id: h.id,
    event_name: eventName,
    payload,
    delivery_id: crypto.randomUUID(),
    status: "pending" as const,
    next_attempt_at: new Date().toISOString(),
  }));

  const { error: insErr } = await supabase.from("webhook_outbound_queue").insert(deliveryRows);
  if (insErr) console.error("enqueueOutboundForEvent insert error", insErr);
}

async function triggerDispatcherBestEffort(): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!base || !secret) return;
  try {
    await fetch(`${base}/functions/v1/webhook-dispatcher`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch_size: 30 }),
    });
  } catch (e) {
    console.error("triggerDispatcherBestEffort", e);
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChannelRow = {
  id: string;
  organization_id: string;
  config: Record<string, unknown> | null;
  is_active: boolean | null;
};

async function handleTelegramUpdate(
  supabase: SupabaseClient,
  channel: ChannelRow,
  update: Record<string, unknown>,
) {
  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const from = msg.from as Record<string, unknown> | undefined;
  const chat = msg.chat as Record<string, unknown> | undefined;
  const text = String((msg.text as string | undefined) ?? "");
  const tgUserId = String(from?.id ?? "");
  const chatId = String(chat?.id ?? "");
  const username = from?.username ? String(from.username) : "";

  const phone = `telegram:${tgUserId}`;

  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("phone", phone)
    .maybeSingle();

  let contactId = existing?.id as string | undefined;
  if (!contactId) {
    const { data: ins, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: channel.organization_id,
        phone,
        name: username || `TG ${tgUserId}`,
        custom_fields: { telegram_user_id: tgUserId, telegram_chat_id: chatId },
      })
      .select("id")
      .single();
    if (error) throw error;
    contactId = ins!.id as string;
  }

  const { data: openConv } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("organization_id", channel.organization_id)
    .eq("channel_id", channel.id)
    .eq("contact_id", contactId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = openConv?.id as string | undefined;
  let unread = (openConv?.unread_count as number | null) ?? 0;

  if (!conversationId) {
    const { data: cnew, error: cErr } = await supabase
      .from("conversations")
      .insert({
        organization_id: channel.organization_id,
        contact_id: contactId,
        channel_id: channel.id,
        status: "open",
        subject: `Telegram ${username || tgUserId}`,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    conversationId = cnew!.id as string;
    unread = 0;

    {
      const { data: assigneeId, error: assignErr } = await supabase.rpc("assign_conversation_agent", {
        p_organization_id: channel.organization_id,
        p_channel_id: channel.id,
      });
      if (assignErr) console.error("assign_conversation_agent", assignErr);
      else if (assigneeId) {
        await supabase.from("conversations").update({ assignee_id: assigneeId }).eq("id", conversationId);
      }
    }

    await enqueueOutboundForEvent(supabase, channel.organization_id, "conversation_created", {
      event: "conversation_created",
      conversation_id: conversationId,
      contact_id: contactId,
      channel_id: channel.id,
      account: { id: channel.organization_id },
      timestamp: new Date().toISOString(),
    });
  }

  const { data: msgRow, error: mErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: "contact",
      sender_id: contactId,
      message_type: "incoming",
      content: text || "[sem texto]",
      content_type: "text",
      metadata: { telegram_message_id: msg.message_id, chat_id: chatId },
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      unread_count: unread + 1,
    })
    .eq("id", conversationId);

  await enqueueOutboundForEvent(supabase, channel.organization_id, "message_created", {
    event: "message_created",
    account: { id: channel.organization_id },
    timestamp: new Date().toISOString(),
    id: msgRow!.id,
    message_type: "incoming",
    content_type: "text",
    content: text,
    conversation: { id: conversationId, channel: "telegram", inbox_id: channel.id },
    contact: { id: contactId },
  });

  await triggerDispatcherBestEffort();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (secret) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (got !== secret) {
      return new Response(JSON.stringify({ error: "secret inválido" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  const url = new URL(req.url);
  const channelId = url.searchParams.get("channel_id");
  if (!channelId) {
    return new Response(JSON.stringify({ error: "channel_id na query é obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const { data: channel, error: chErr } = await supabase
    .from("channels")
    .select("id, organization_id, config, is_active")
    .eq("id", channelId)
    .eq("channel_type", "telegram")
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ error: "Canal não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ch = channel as ChannelRow;
  if (!ch.is_active) {
    return new Response(JSON.stringify({ error: "Canal inativo" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    await handleTelegramUpdate(supabase, ch, update);
  } catch (e) {
    console.error("telegram-webhook", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
