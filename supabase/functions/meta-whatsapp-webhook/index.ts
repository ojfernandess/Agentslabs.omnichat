/**
 * Webhook Meta WhatsApp — S3/MinIO inline (deploy cloud não inclui ../_shared).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

function s3MediaConfigured(): boolean {
  return Boolean(
    Deno.env.get("S3_MEDIA_ENDPOINT")?.trim() &&
      Deno.env.get("S3_MEDIA_ACCESS_KEY")?.trim() &&
      Deno.env.get("S3_MEDIA_SECRET_KEY")?.trim() &&
      Deno.env.get("MEDIA_PUBLIC_BASE_URL")?.trim(),
  );
}

let _s3MediaClient: S3Client | null = null;

function getS3MediaClient(): S3Client {
  if (_s3MediaClient) return _s3MediaClient;
  const endpoint = Deno.env.get("S3_MEDIA_ENDPOINT")!.trim();
  const region = Deno.env.get("S3_MEDIA_REGION")?.trim() || "us-east-1";
  const forcePathStyle = Deno.env.get("S3_MEDIA_FORCE_PATH_STYLE") !== "false";
  _s3MediaClient = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: Deno.env.get("S3_MEDIA_ACCESS_KEY")!.trim(),
      secretAccessKey: Deno.env.get("S3_MEDIA_SECRET_KEY")!.trim(),
    },
    forcePathStyle,
  });
  return _s3MediaClient;
}

async function s3PutObject(
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = getS3MediaClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

function publicUrlForS3Object(bucket: string, key: string): string {
  const base = Deno.env.get("MEDIA_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  const safeKey = key.replace(/^\//, "");
  return `${base}/${bucket}/${safeKey}`;
}

function S3_BUCKET_MESSAGE(): string {
  return Deno.env.get("S3_MEDIA_BUCKET_MESSAGE")?.trim() || "message-media";
}

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

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const v = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isNaN(v)) return null;
    out[i / 2] = v;
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function verifyInternalHook(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_HOOK_SECRET");
  if (!secret || secret.length < 16) return false;
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-internal-key");
  const token = bearer ?? header;
  return token === secret;
}

/** Chave idempotente para deduplicar retries da Meta (mensagem ou status). */
function dedupeKeyFromMetaPayload(payload: Record<string, unknown>): string | null {
  try {
    const entries = payload.entry as Array<Record<string, unknown>> | undefined;
    const ent = entries?.[0];
    const changes = ent?.changes as Array<Record<string, unknown>> | undefined;
    const change = changes?.[0];
    const value = change?.value as Record<string, unknown> | undefined;
    const messages = value?.messages as Array<Record<string, unknown>> | undefined;
    const mid = messages?.[0]?.id;
    if (mid != null) return String(mid);
    const statuses = value?.statuses as Array<Record<string, unknown>> | undefined;
    const sid = statuses?.[0]?.id;
    if (sid != null) return `status:${String(sid)}`;
  } catch {
    /* ignore */
  }
  return null;
}

async function sha256Short(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 64);
}

async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice(7);
  const received = hexToBytes(receivedHex);
  if (!received) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const actual = new Uint8Array(sig);
  return timingSafeEqual(received, actual);
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

async function handleStatuses(
  supabase: SupabaseClient,
  value: Record<string, unknown>,
) {
  const statuses = value.statuses as Array<Record<string, unknown>> | undefined;
  for (const st of statuses ?? []) {
    const mid = String(st.id ?? "");
    if (!mid) continue;
    const status = String(st.status ?? "");

    const { data: rows } = await supabase
      .from("messages")
      .select("id, metadata, conversation_id")
      .contains("metadata", { whatsapp_message_id: mid })
      .limit(5);

    const row = rows?.[0];
    if (!row) continue;
    const { data: conv } = await supabase
      .from("conversations")
      .select("organization_id")
      .eq("id", row.conversation_id)
      .maybeSingle();
    const orgId = conv?.organization_id as string | undefined;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    await supabase
      .from("messages")
      .update({
        metadata: { ...meta, whatsapp_status: status, status_ts: st.timestamp },
      })
      .eq("id", row.id);

    if (orgId) {
      await enqueueOutboundForEvent(supabase, orgId, "message_updated", {
        event: "message_updated",
        message_id: row.id,
        status,
        whatsapp_message_id: mid,
      });
    }
  }
}

async function fetchMetaMediaAndUpload(
  accessToken: string,
  mediaId: string,
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
): Promise<{ url: string; mime_type: string } | null> {
  try {
    const version = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { url?: string; mime_type?: string; error?: unknown };
    if (!res.ok || !data.url) return null;
    const mediaRes = await fetch(data.url);
    if (!mediaRes.ok) return null;
    const blob = await mediaRes.blob();
    const ext = data.mime_type?.includes("ogg") ? "ogg" : data.mime_type?.includes("mpeg") ? "mp3" : "bin";
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const ct = data.mime_type ?? "audio/ogg";
    const bin = new Uint8Array(await blob.arrayBuffer());
    if (s3MediaConfigured()) {
      try {
        await s3PutObject(S3_BUCKET_MESSAGE(), path, bin, ct);
      } catch {
        return null;
      }
      return { url: publicUrlForS3Object(S3_BUCKET_MESSAGE(), path), mime_type: ct };
    }
    const { error } = await supabase.storage.from("message-media").upload(path, bin, {
      contentType: ct,
      upsert: false,
    });
    if (error) return null;
    const { data: pub } = supabase.storage.from("message-media").getPublicUrl(path);
    return { url: pub.publicUrl, mime_type: ct };
  } catch {
    return null;
  }
}

async function handleInboundMessages(
  supabase: SupabaseClient,
  channel: ChannelRow,
  value: Record<string, unknown>,
) {
  const messages = value.messages as Array<Record<string, unknown>> | undefined;
  const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
  if (!messages?.length) return;

  const profileName =
    contacts?.[0] && typeof contacts[0].profile === "object"
      ? (contacts[0].profile as { name?: string }).name
      : undefined;

  const config = (channel.config ?? {}) as Record<string, unknown>;
  const meta = (config.meta ?? {}) as Record<string, unknown>;
  const accessToken = String(meta.access_token ?? meta.accessToken ?? "");

  for (const msg of messages) {
    const from = String(msg.from ?? "");
    let textBody = "";
    let contentType = "text";
    const audioMediaId = msg.type === "audio" && msg.audio && typeof msg.audio === "object"
      ? String((msg.audio as { id?: string }).id ?? "")
      : "";

    if (msg.type === "text" && msg.text && typeof msg.text === "object") {
      textBody = String((msg.text as { body?: string }).body ?? "");
    } else if (msg.type === "audio") {
      textBody = "🎤 Áudio";
      contentType = "audio";
    } else {
      textBody = `[${msg.type ?? "mensagem"}]`;
    }

    const mid = String(msg.id ?? "");
    const phone = from.startsWith("+") ? from : `+${from}`;

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
      const trimmed = textBody.trim();
      const isCsatDigit = contentType === "text" && /^[1-5]$/.test(trimmed);
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
              metadata: { whatsapp_message_id: mid, raw_type: msg.type, csat_response: true },
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

    const { data: msgRow, error: mErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_type: "contact",
        sender_id: contactId,
        message_type: "incoming",
        content: textBody || `[${msg.type}]`,
        content_type: "text",
        metadata: { whatsapp_message_id: mid, raw_type: msg.type },
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

async function processWhatsAppPayload(
  supabase: SupabaseClient,
  channel: ChannelRow,
  payload: Record<string, unknown>,
) {
  const entries = payload.entry as Array<Record<string, unknown>> | undefined;
  for (const ent of entries ?? []) {
    const changes = ent.changes as Array<Record<string, unknown>> | undefined;
    for (const change of changes ?? []) {
      const value = change.value as Record<string, unknown> | undefined;
      if (!value) continue;
      if (Array.isArray(value.messages) && value.messages.length > 0) {
        await handleInboundMessages(supabase, channel, value);
      }
      if (Array.isArray(value.statuses) && value.statuses.length > 0) {
        await handleStatuses(supabase, value);
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
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
    const meta = (config.meta ?? {}) as Record<string, unknown>;
    const verifyToken = String(meta.verify_token ?? "");
    const appSecret = String(meta.app_secret ?? Deno.env.get("META_APP_SECRET") ?? "");

    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === verifyToken && challenge) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain", ...cors },
        });
      }
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    const rawBody = await req.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Processamento interno (worker process-webhook-ingest) — sem assinatura Meta
    if (payload["_internal_process"] === true && verifyInternalHook(req)) {
      const inner = payload["payload"] as Record<string, unknown> | undefined;
      if (!inner) {
        return new Response(JSON.stringify({ error: "payload interno em falta" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await processWhatsAppPayload(supabase, ch, inner);
      await triggerDispatcherBestEffort();
      return new Response(JSON.stringify({ ok: true, internal: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!appSecret) {
      return new Response(JSON.stringify({ error: "Defina meta.app_secret no canal ou META_APP_SECRET" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const sig = req.headers.get("X-Hub-Signature-256");
    const ok = await verifyMetaSignature(rawBody, sig, appSecret);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Assinatura Meta inválida" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const fastAck = Deno.env.get("META_WEBHOOK_FAST_ACK") !== "false";

    if (fastAck) {
      const dedupe = dedupeKeyFromMetaPayload(payload) ?? (await sha256Short(rawBody));
      const { error: insErr } = await supabase.from("webhook_ingest_jobs").insert({
        channel_id: ch.id,
        payload,
        dedupe_key: dedupe,
        status: "pending",
        next_attempt_at: new Date().toISOString(),
      });
      if (insErr) {
        const dup =
          insErr.code === "23505" ||
          String(insErr.message ?? "").toLowerCase().includes("duplicate") ||
          String(insErr.details ?? "").includes("already exists");
        if (dup) {
          return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        console.error("webhook_ingest_jobs insert", insErr);
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, queued: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await processWhatsAppPayload(supabase, ch, payload);
    await triggerDispatcherBestEffort();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meta-whatsapp-webhook", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
