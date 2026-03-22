/**
 * Webhook HTTP para Evolution API v2 (Baileys) — eventos MESSAGES_UPSERT / messages.upsert.
 * @see https://doc.evolution-api.com/v2/en/configuration/webhooks
 *
 * Configure na Evolution: POST /webhook/set/{instance} com URL:
 *   {SUPABASE_URL}/functions/v1/evolution-whatsapp-webhook?channel_id={UUID}
 * Eventos recomendados: MESSAGES_UPSERT, CONNECTION_UPDATE (opcional).
 *
 * Opcional: defina config.evolution.webhook_secret e use ?secret=... na URL.
 */
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
  const url = `${base}/functions/v1/webhook-dispatcher`;
  try {
    await fetch(url, {
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
  channel_type: string;
  config: Record<string, unknown> | null;
  is_active: boolean | null;
};

type NormalizedInbound = {
  phone: string;
  textBody: string;
  externalId: string;
  profileName?: string;
  contentType?: string;
  rawMessage?: Record<string, unknown>;
  /** Base64 do áudio quando webhook_base64=true na Evolution */
  audioBase64?: string;
  audioMimetype?: string;
};

async function notifyAgentBot(
  supabase: SupabaseClient,
  channelId: string,
  _orgId: string,
  payload: Record<string, unknown>,
) {
  const { data: link } = await supabase
    .from("channel_agent_bots")
    .select("agent_bot_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!link?.agent_bot_id) return;

  const { data: bot } = await supabase
    .from("agent_bots")
    .select("outgoing_webhook_url, access_token, is_active")
    .eq("id", link.agent_bot_id)
    .maybeSingle();

  if (!bot?.is_active) return;

  await fetch(bot.outgoing_webhook_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bot.access_token}`,
    },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("agent bot notify", e));
}

/** Extrai mensagens de entrada (fromMe=false) a partir do payload Evolution v2. */
function normalizeEvolutionInbound(body: Record<string, unknown>): NormalizedInbound[] {
  const eventRaw = String(body.event ?? "");
  const event = eventRaw.toLowerCase();
  const isUpsert =
    event.includes("messages.upsert") ||
    event === "messages_upsert" ||
    /MESSAGES_UPSERT/i.test(eventRaw);
  if (!isUpsert) {
    return [];
  }

  const rawData = body.data;
  const candidates: unknown[] = [];

  if (Array.isArray(rawData)) {
    for (const d of rawData) candidates.push(d);
  } else if (rawData && typeof rawData === "object") {
    const d = rawData as Record<string, unknown>;
    if (Array.isArray(d.messages)) {
      for (const m of d.messages) candidates.push(m);
    } else if (d.key && d.message) {
      candidates.push(d);
    }
  }

  const out: NormalizedInbound[] = [];

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const key = m.key as Record<string, unknown> | undefined;
    if (!key) continue;
    if (key.fromMe === true) continue;

    const remoteJid = String(key.remoteJid ?? "");
    if (!remoteJid || remoteJid.includes("@g.us")) continue;

    const mid = String(key.id ?? "");
    if (!mid) continue;

    const digits = remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
    const phone = digits.length > 0 ? `+${digits}` : remoteJid;
    const profileName = typeof m.pushName === "string" ? m.pushName : undefined;

    const msg = m.message as Record<string, unknown> | undefined;
    let textBody = "";
    if (msg?.conversation) textBody = String(msg.conversation);
    else if (msg?.extendedTextMessage && typeof msg.extendedTextMessage === "object") {
      textBody = String((msg.extendedTextMessage as { text?: string }).text ?? "");
    } else if (msg?.imageMessage && typeof msg.imageMessage === "object") {
      const cap = (msg.imageMessage as { caption?: string }).caption;
      textBody = cap ? String(cap) : "[imagem]";
    } else if (msg?.videoMessage && typeof msg.videoMessage === "object") {
      const cap = (msg.videoMessage as { caption?: string }).caption;
      textBody = cap ? String(cap) : "[vídeo]";
    } else if (msg?.audioMessage) {
      const audioMsg = msg.audioMessage as Record<string, unknown> | undefined;
      const b64 = audioMsg?.base64 as string | undefined;
      const mt = audioMsg?.mimetype as string | undefined;
      textBody = "🎤 Áudio";
      out.push({
        phone,
        textBody,
        externalId: mid,
        profileName,
        contentType: "audio",
        rawMessage: m as Record<string, unknown>,
        ...(b64 && { audioBase64: b64, audioMimetype: mt }),
      });
      continue;
    } else if (msg?.documentMessage) {
      textBody = "[documento]";
    } else if (msg) {
      textBody = `[${Object.keys(msg)[0] ?? "mensagem"}]`;
    }

    out.push({
      phone,
      textBody: textBody.trim() || "[vazio]",
      externalId: mid,
      profileName,
    });
  }

  return out;
}

async function uploadToStorageWithRetry(
  supabase: SupabaseClient,
  path: string,
  bin: Uint8Array,
  contentType: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage.from("message-media").upload(path, bin, {
      contentType,
      upsert: false,
    });
    if (!error) return true;
    const isRetryable = error.message.includes("timeout") || error.message.includes("timed out") || error.message.includes("connection");
    if (attempt < 3 && isRetryable) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    } else {
      console.error("[evolution-audio] storage upload error", error.message);
      return false;
    }
  }
  return false;
}

async function uploadAudioBase64(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
  base64: string,
  mimetype?: string,
): Promise<Array<{ url: string; mime_type: string }> | null> {
  try {
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mpeg") ? "mp3" : "bin";
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const ct = mimetype ?? "audio/ogg";
    if (!(await uploadToStorageWithRetry(supabase, path, bin, ct))) return null;
    const { data: pub } = supabase.storage.from("message-media").getPublicUrl(path);
    return [{ url: pub.publicUrl, mime_type: ct }];
  } catch {
    return null;
  }
}

async function fetchEvolutionAudioAndUpload(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  rawMessage: Record<string, unknown>,
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
): Promise<Array<{ url: string; mime_type: string }> | null> {
  const key = rawMessage.key as Record<string, unknown> | undefined;
  const keyId = key?.id as string | undefined;
  if (!keyId) {
    console.error("[evolution-audio] missing key.id in rawMessage");
    return null;
  }
  const url = `${baseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;
  const payloads = [
    { message: { key: { id: keyId } }, convertToMp4: false },
    { message: rawMessage, convertToMp4: false },
  ];
  for (const bodyPayload of payloads) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(bodyPayload),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const dataObj = json.data as Record<string, unknown> | undefined;
      const msgObj = dataObj?.message as Record<string, unknown> | undefined;
      const base64 = (json.base64 ?? dataObj?.base64 ?? msgObj?.base64) as string | undefined;
      const mimetype = (json.mimetype ?? dataObj?.mimetype ?? msgObj?.mimetype) as string | undefined;
      if (!res.ok) {
        console.error("[evolution-audio] API error", res.status, JSON.stringify(json).slice(0, 300));
        continue;
      }
      if (!base64 || typeof base64 !== "string") {
        console.error("[evolution-audio] no base64 in response", Object.keys(json));
        continue;
      }
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mpeg") ? "mp3" : "bin";
      const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
      const ct = mimetype ?? "audio/ogg";
      if (await uploadToStorageWithRetry(supabase, path, bin, ct)) {
        const { data: pub } = supabase.storage.from("message-media").getPublicUrl(path);
        return [{ url: pub.publicUrl, mime_type: ct }];
      }
      continue;
    } catch (e) {
      console.error("[evolution-audio] fetch/upload error", String(e));
      continue;
    }
  }
  console.error("[evolution-audio] all payloads failed for key.id", keyId);
  return null;
}

async function processInboundBatch(
  supabase: SupabaseClient,
  channel: ChannelRow,
  items: NormalizedInbound[],
) {
  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  const evolution = (cfg.evolution ?? {}) as Record<string, unknown>;
  const baseUrl = String(evolution.base_url ?? evolution.baseUrl ?? cfg.evolution_base_url ?? "").replace(/\/$/, "");
  const apiKey = String(evolution.api_key ?? evolution.apiKey ?? cfg.evolution_api_key ?? "");
  const instanceName = String(evolution.instance_name ?? evolution.instanceName ?? cfg.evolution_instance_name ?? "");

  for (const it of items) {
    const textBody = it.textBody;
    const mid = it.externalId;
    const profileName = it.profileName;
    const phone = it.phone;
    const contentType = it.contentType ?? "text";

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
          name: profileName ?? phone,
        })
        .select("id")
        .single();
      if (error) throw error;
      contactId = ins!.id as string;
    } else if (profileName && profileName.trim()) {
      await supabase
        .from("contacts")
        .update({ name: profileName.trim() })
        .eq("id", contactId);
    }

    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    const lockToSingle = !!(cfg.lock_to_single_conversation as boolean);

    const convQuery = supabase
      .from("conversations")
      .select("id, unread_count, status, custom_attributes")
      .eq("organization_id", channel.organization_id)
      .eq("channel_id", channel.id)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!lockToSingle) {
      convQuery.neq("status", "resolved");
    }
    const { data: existingConv } = await convQuery.maybeSingle();

    let conversationId = existingConv?.id as string | undefined;
    let unread = (existingConv?.unread_count as number | null) ?? 0;
    const wasResolved = existingConv?.status === "resolved";
    const attrs = (existingConv?.custom_attributes ?? {}) as Record<string, unknown>;
    const isCsatPending = !!(attrs.csat_pending as boolean);
    const trimmed = textBody.trim();
    const isCsatDigit = /^[1-5]$/.test(trimmed);

    if (conversationId && wasResolved && isCsatPending && isCsatDigit) {
      const pend = existingConv!;
      const score = parseInt(trimmed, 10);
      const prev = (pend.custom_attributes ?? {}) as Record<string, unknown>;
      const newAttrs = {
        ...prev,
        csat_pending: false,
        csat_answered_at: new Date().toISOString(),
      };
      const { data: msgRow, error: mErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: pend.id,
          sender_type: "contact",
          sender_id: contactId,
          message_type: "incoming",
          content: textBody || trimmed,
          content_type: "text",
          metadata: {
            evolution_message_id: mid,
            raw_type: "text",
            csat_response: true,
            source: "evolution",
          },
        })
        .select("id")
        .single();
      if (mErr) throw mErr;

      const u = (pend.unread_count as number | null) ?? 0;
      const nowIso = new Date().toISOString();
      await supabase
        .from("conversations")
        .update({
          satisfaction_score: score,
          custom_attributes: newAttrs,
          last_message_at: nowIso,
          unread_count: u + 1,
        })
        .eq("id", pend.id);

      const basePayload = {
        event: "message_created",
        account: { id: channel.organization_id },
        timestamp: nowIso,
        id: msgRow!.id,
        message_type: "incoming",
        content_type: "text",
        content: textBody,
        conversation: {
          id: pend.id,
          channel: "whatsapp",
          inbox_id: channel.id,
        },
        contact: { id: contactId, phone_number: phone },
      };

      await enqueueOutboundForEvent(supabase, channel.organization_id, "message_created", basePayload);
      await notifyAgentBot(supabase, channel.id, channel.organization_id, {
        event: "message_created",
        ...basePayload,
      });
      continue;
    }

    if (!conversationId) {
      if (isCsatDigit) {
        const { data: pend } = await supabase
          .from("conversations")
          .select("id, unread_count, custom_attributes")
          .eq("organization_id", channel.organization_id)
          .eq("channel_id", channel.id)
          .eq("contact_id", contactId)
          .eq("status", "resolved")
          .contains("custom_attributes", { csat_pending: true })
          .order("resolved_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pend?.id) {
          const score = parseInt(trimmed, 10);
          const prev = (pend.custom_attributes ?? {}) as Record<string, unknown>;
          const attrs = {
            ...prev,
            csat_pending: false,
            csat_answered_at: new Date().toISOString(),
          };
          const { data: msgRow, error: mErr } = await supabase
            .from("messages")
            .insert({
              conversation_id: pend.id,
              sender_type: "contact",
              sender_id: contactId,
              message_type: "incoming",
              content: textBody || trimmed,
              content_type: "text",
              metadata: {
                evolution_message_id: mid,
                raw_type: "text",
                csat_response: true,
                source: "evolution",
              },
            })
            .select("id")
            .single();
          if (mErr) throw mErr;

          const u = (pend.unread_count as number | null) ?? 0;
          const nowIso = new Date().toISOString();
          await supabase
            .from("conversations")
            .update({
              satisfaction_score: score,
              custom_attributes: attrs,
              last_message_at: nowIso,
              unread_count: u + 1,
            })
            .eq("id", pend.id);

          const basePayload = {
            event: "message_created",
            account: { id: channel.organization_id },
            timestamp: new Date().toISOString(),
            id: msgRow!.id,
            message_type: "incoming",
            content_type: "text",
            content: textBody,
            conversation: {
              id: pend.id,
              channel: "whatsapp",
              inbox_id: channel.id,
            },
            contact: { id: contactId, phone_number: phone },
          };

          await enqueueOutboundForEvent(supabase, channel.organization_id, "message_created", basePayload);
          await notifyAgentBot(supabase, channel.id, channel.organization_id, {
            event: "message_created",
            ...basePayload,
          });
          continue;
        }
      }

      const { data: cnew, error: cErr } = await supabase
        .from("conversations")
        .insert({
          organization_id: channel.organization_id,
          contact_id: contactId,
          channel_id: channel.id,
          status: "open",
          subject: `WhatsApp ${phone}`,
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

    let attachments: Array<{ url: string; mime_type?: string }> = [];
    if (contentType === "audio") {
      if (it.audioBase64) {
        const media = await uploadAudioBase64(supabase, channel.organization_id, conversationId, it.audioBase64, it.audioMimetype);
        if (media) attachments = media;
      } else if (it.rawMessage && baseUrl && apiKey && instanceName) {
        const media = await fetchEvolutionAudioAndUpload(
          baseUrl,
          apiKey,
          instanceName,
          it.rawMessage,
          supabase,
          channel.organization_id,
          conversationId,
        );
        if (media) attachments = media;
      } else if (!it.audioBase64 && (!baseUrl || !apiKey || !instanceName)) {
        console.error("[evolution-audio] config incompleto: base_url, api_key e instance_name necessários em channel.config.evolution");
      }
    }

    const insertPayload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_type: "contact",
      sender_id: contactId,
      message_type: "incoming",
      content: textBody || "[texto]",
      content_type: contentType,
      metadata: {
        evolution_message_id: mid,
        raw_type: contentType === "audio" ? "audio" : "text",
        source: "evolution",
      },
    };
    if (attachments.length > 0) {
      insertPayload.attachments = attachments.map((a) => ({
        url: a.url,
        mime_type: a.mime_type ?? "audio/ogg",
        file_name: `audio-${Date.now()}.ogg`,
      }));
    }

    const { data: msgRow, error: mErr } = await supabase
      .from("messages")
      .insert(insertPayload)
      .select("id")
      .single();
    if (mErr) throw mErr;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: unread + 1,
        ...(wasResolved && { status: "open", resolved_at: null }),
      })
      .eq("id", conversationId);

    const basePayload = {
      event: "message_created",
      account: { id: channel.organization_id },
      timestamp: new Date().toISOString(),
      id: msgRow!.id,
      message_type: "incoming",
      content_type: contentType,
      content: textBody,
      conversation: {
        id: conversationId,
        channel: "whatsapp",
        inbox_id: channel.id,
      },
      contact: { id: contactId, phone_number: phone },
    };

    await enqueueOutboundForEvent(supabase, channel.organization_id, "message_created", basePayload);

    await notifyAgentBot(supabase, channel.id, channel.organization_id, {
      event: "message_created",
      ...basePayload,
    });
  }
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

  try {
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channel_id");
    if (!channelId) {
      return new Response(JSON.stringify({ error: "channel_id obrigatório na query" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const { data: channel, error: chErr } = await supabase
      .from("channels")
      .select("id, organization_id, channel_type, config, is_active")
      .eq("id", channelId)
      .eq("channel_type", "whatsapp")
      .maybeSingle();

    if (chErr || !channel) {
      return new Response(JSON.stringify({ error: "Canal WhatsApp não encontrado" }), {
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

    const config = (ch.config ?? {}) as Record<string, unknown>;
    const evolution = (config.evolution ?? {}) as Record<string, unknown>;

    if (String(config.whatsapp_provider ?? "") !== "evolution") {
      return new Response(
        JSON.stringify({
          error: "Este webhook é só para caixas com whatsapp_provider: evolution no config",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    if (!String(evolution.instance_name ?? "").trim()) {
      return new Response(JSON.stringify({ error: "Defina evolution.instance_name no config da caixa" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const secret = String(evolution.webhook_secret ?? "");
    if (secret) {
      const q = url.searchParams.get("secret");
      const h = req.headers.get("x-evolution-secret") ?? req.headers.get("x-webhook-secret");
      if (q !== secret && h !== secret) {
        return new Response(JSON.stringify({ error: "Secret inválido" }), {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const items = normalizeEvolutionInbound(payload);
    if (items.length > 0) {
      await processInboundBatch(supabase, ch, items);
      await triggerDispatcherBestEffort();
    }

    return new Response(JSON.stringify({ ok: true, processed: items.length }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evolution-whatsapp-webhook", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
