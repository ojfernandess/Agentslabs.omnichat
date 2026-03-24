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
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.654.0";

/** S3/MinIO — inline para deploy remoto. Manter em sync com _shared/s3-media.ts */
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

function s3EdgePutDisabled(): boolean {
  const v = Deno.env.get("S3_MEDIA_DISABLE_EDGE_PUT")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
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
  /** Base64 quando webhook_base64=true na Evolution */
  audioBase64?: string;
  audioMimetype?: string;
  imageBase64?: string;
  imageMimetype?: string;
  videoBase64?: string;
  videoMimetype?: string;
  documentBase64?: string;
  documentMimetype?: string;
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

/** Evita tratar imageMessage/video vazios como mídia real (stickers costumam vir com imageMessage {} + stickerMessage). */
function looksLikePopulatedMediaNode(n: Record<string, unknown>): boolean {
  return Boolean(
    n.url ||
      n.base64 ||
      n.directPath ||
      n.fileLength ||
      n.mimetype ||
      n.jpegThumbnail ||
      n.mediaKey ||
      n.fileSha256,
  );
}

function uint8ArrayToBase64(u8: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function tryNumberArrayToUint8(raw: unknown): Uint8Array | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  for (let i = 0; i < raw.length; i++) {
    if (typeof raw[i] !== "number") return null;
  }
  return new Uint8Array(raw as number[]);
}

/** Node serializa Buffer como `{ type: \"Buffer\", data: number[] }` em alguns webhooks. */
function tryJsonBufferToUint8(raw: unknown): Uint8Array | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "Buffer" || !Array.isArray(r.data)) return null;
  const d = r.data as unknown[];
  if (d.length === 0) return null;
  for (let i = 0; i < d.length; i++) {
    if (typeof d[i] !== "number") return null;
  }
  return new Uint8Array(d as number[]);
}

function extractStickerMedia(
  stRaw: unknown,
): { b64?: string; mt: string } | null {
  if (stRaw === null || stRaw === undefined || stRaw === "") return null;
  if (typeof stRaw === "string") {
    const s = stRaw.trim();
    if (s.length >= 32) {
      const b64 = s.includes(",") ? (s.split(",")[1] ?? s).trim() : s;
      return { b64, mt: "image/webp" };
    }
    if (s.length >= 8) {
      const inner = (s.includes(",") ? (s.split(",")[1] ?? s) : s).trim().replace(/\s/g, "");
      try {
        const bin = Uint8Array.from(atob(inner), (c) => c.charCodeAt(0));
        if (bin.length > 0) return { b64: inner, mt: "image/webp" };
      } catch {
        /* não é base64 válido */
      }
    }
    return null;
  }
  const fromArr = tryNumberArrayToUint8(stRaw);
  if (fromArr) {
    return { b64: uint8ArrayToBase64(fromArr), mt: "image/webp" };
  }
  const fromBuf = tryJsonBufferToUint8(stRaw);
  if (fromBuf) {
    return { b64: uint8ArrayToBase64(fromBuf), mt: "image/webp" };
  }
  if (typeof stRaw === "object" && !Array.isArray(stRaw)) {
    const sticker = stRaw as Record<string, unknown>;
    return {
      b64: sticker.base64 as string | undefined,
      mt: (sticker.mimetype as string | undefined) ?? "image/webp",
    };
  }
  return null;
}

/**
 * Deteta mídia Baileys por chaves explícitas (paridade com Chatwoot: anexo/mídia antes do texto).
 * Evita gravar imagem como texto quando `conversation` e `imageMessage` vêm ambos no payload.
 * Stickers primeiro: vêm muitas vezes com `imageMessage` vazio ou duplicado + `stickerMessage` real.
 */
function extractBaileysMedia(msg: Record<string, unknown> | undefined): {
  kind: "image" | "video" | "document" | "audio";
  textBody: string;
  b64?: string;
  mt?: string;
} | null {
  if (!msg) return null;
  const stRaw = msg.stickerMessage ?? msg.sticker;
  const stickerPart = extractStickerMedia(stRaw);
  if (stickerPart) {
    return {
      kind: "image",
      textBody: "[Sticker]",
      b64: stickerPart.b64,
      mt: stickerPart.mt,
    };
  }
  const imgRaw = msg.imageMessage ?? msg.image;
  if (imgRaw && typeof imgRaw === "object" && !Array.isArray(imgRaw)) {
    const img = imgRaw as Record<string, unknown>;
    if (looksLikePopulatedMediaNode(img)) {
      const cap = img.caption as string | undefined;
      return {
        kind: "image",
        textBody: cap ? String(cap) : "[Imagem]",
        b64: img.base64 as string | undefined,
        mt: img.mimetype as string | undefined,
      };
    }
  }
  const vidRaw = msg.videoMessage ?? msg.video;
  if (vidRaw && typeof vidRaw === "object" && !Array.isArray(vidRaw)) {
    const vid = vidRaw as Record<string, unknown>;
    if (looksLikePopulatedMediaNode(vid)) {
      const cap = vid.caption as string | undefined;
      return {
        kind: "video",
        textBody: cap ? String(cap) : "[Vídeo]",
        b64: vid.base64 as string | undefined,
        mt: vid.mimetype as string | undefined,
      };
    }
  }
  const docRaw = msg.documentMessage ?? msg.document;
  if (docRaw && typeof docRaw === "object" && !Array.isArray(docRaw)) {
    const doc = docRaw as Record<string, unknown>;
    if (looksLikePopulatedMediaNode(doc)) {
      const fn = doc.fileName as string | undefined;
      return {
        kind: "document",
        textBody: fn ? String(fn) : "[Documento]",
        b64: doc.base64 as string | undefined,
        mt: doc.mimetype as string | undefined,
      };
    }
  }
  const audioMsg = msg.audioMessage as Record<string, unknown> | undefined;
  if (audioMsg && typeof audioMsg === "object" && !Array.isArray(audioMsg)) {
    return {
      kind: "audio",
      textBody: "[Áudio]",
      b64: audioMsg.base64 as string | undefined,
      mt: audioMsg.mimetype as string | undefined,
    };
  }
  return null;
}

/** Junta `key` do envelope Evolution ao nó interno quando o webhook manda só `data.message` (sem `data.key`). */
function mergeEvolutionMessageEnvelope(
  body: Record<string, unknown>,
  d: Record<string, unknown>,
  inner: Record<string, unknown>,
): Record<string, unknown> {
  if (inner.key) return inner;
  const parentKey = d.key ?? body.key;
  if (!parentKey) return inner;
  return {
    key: parentKey,
    pushName: d.pushName ?? body.pushName,
    messageType: d.messageType ?? body.messageType,
    message: inner,
  };
}

/** Desembrulha viewOnce, ephemeral, editedMessage, documentWithCaption (Baileys / Evolution). */
function peelBaileysMessageLayers(msg: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!msg) return msg;
  let cur = msg;
  for (let depth = 0; depth < 8; depth++) {
    const vo = cur.viewOnceMessage as Record<string, unknown> | undefined;
    if (vo?.message && typeof vo.message === "object" && !Array.isArray(vo.message)) {
      cur = vo.message as Record<string, unknown>;
      continue;
    }
    const ep = cur.ephemeralMessage as Record<string, unknown> | undefined;
    if (ep?.message && typeof ep.message === "object" && !Array.isArray(ep.message)) {
      cur = ep.message as Record<string, unknown>;
      continue;
    }
    const ed = cur.editedMessage as Record<string, unknown> | undefined;
    if (ed?.message && typeof ed.message === "object" && !Array.isArray(ed.message)) {
      cur = ed.message as Record<string, unknown>;
      continue;
    }
    const dwc = cur.documentWithCaptionMessage as Record<string, unknown> | undefined;
    if (dwc?.message && typeof dwc.message === "object" && !Array.isArray(dwc.message)) {
      cur = dwc.message as Record<string, unknown>;
      continue;
    }
    break;
  }
  return cur;
}

function isFromMeTrue(key: Record<string, unknown> | undefined): boolean {
  if (!key) return false;
  const v = key.fromMe;
  return v === true || v === "true" || v === 1;
}

function bumpSkip(skips: Record<string, number>, reason: string) {
  skips[reason] = (skips[reason] ?? 0) + 1;
}

type EvolutionNormalizeDiagnostic = {
  event_raw: string;
  upsert_matched: boolean;
  candidate_count: number;
  items_normalized: number;
  /** Contagem por tipo após normalização (text, image, audio, …). */
  content_type_counts: Record<string, number>;
  /** Payload traz campos chatwootMessageId / inbox / conversation (Evolution integrada com Chatwoot). */
  chatwoot_enriched_payload: boolean;
  skips: Record<string, number>;
  data_shape: "array" | "object" | "none" | "primitive";
  data_keys_sample: string[];
};

function payloadMentionsChatwoot(body: Record<string, unknown>): boolean {
  const hasCw = (o: unknown): boolean => {
    if (!o || typeof o !== "object") return false;
    const r = o as Record<string, unknown>;
    return (
      r.chatwootMessageId != null ||
      r.chatwootInboxId != null ||
      r.chatwootConversationId != null
    );
  };
  if (hasCw(body)) return true;
  const d = body.data;
  if (hasCw(d)) return true;
  if (d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).messages)) {
    for (const m of (d as Record<string, unknown>).messages as unknown[]) {
      if (hasCw(m)) return true;
    }
  }
  return false;
}

/** Extrai mensagens de entrada (fromMe=false) a partir do payload Evolution v2 + diagnóstico para logs/resposta. */
function normalizeEvolutionInboundWithDiag(body: Record<string, unknown>): {
  items: NormalizedInbound[];
  diagnostic: EvolutionNormalizeDiagnostic;
} {
  const skips: Record<string, number> = {};
  const eventRaw = String(body.event ?? "");
  const event = eventRaw.toLowerCase().replace(/-/g, "_");
  const upsert_matched =
    event.includes("messages.upsert") ||
    event.includes("messages_upsert") ||
    /MESSAGES[_\s.-]*UPSERT/i.test(eventRaw);

  const rawData = body.data !== undefined && body.data !== null ? body.data : body;
  let data_shape: EvolutionNormalizeDiagnostic["data_shape"] = "none";
  let data_keys_sample: string[] = [];
  if (Array.isArray(rawData)) data_shape = "array";
  else if (rawData && typeof rawData === "object") {
    data_shape = "object";
    data_keys_sample = Object.keys(rawData as object).slice(0, 15);
  } else if (rawData !== undefined && rawData !== null) data_shape = "primitive";

  const emptyDiag = (): EvolutionNormalizeDiagnostic => ({
    event_raw: eventRaw,
    upsert_matched,
    candidate_count: 0,
    items_normalized: 0,
    content_type_counts: {},
    chatwoot_enriched_payload: payloadMentionsChatwoot(body),
    skips,
    data_shape,
    data_keys_sample,
  });

  if (!upsert_matched) {
    return { items: [], diagnostic: emptyDiag() };
  }

  const candidates: unknown[] = [];

  if (Array.isArray(body.messages)) {
    for (const x of body.messages) candidates.push(x);
  }

  if (Array.isArray(rawData)) {
    for (const d of rawData) candidates.push(d);
  } else if (rawData && typeof rawData === "object") {
    const d = rawData as Record<string, unknown>;
    if (Array.isArray(d.messages)) {
      for (const m of d.messages) candidates.push(m);
    } else if (d.key && d.message) {
      candidates.push(d);
    } else if (d.message && typeof d.message === "object") {
      const inner = d.message as Record<string, unknown>;
      candidates.push(mergeEvolutionMessageEnvelope(body, d, inner));
    }
  }

  const candidate_count = candidates.length;
  const out: NormalizedInbound[] = [];

  for (const item of candidates) {
    if (!item || typeof item !== "object") {
      bumpSkip(skips, "candidate_not_object");
      continue;
    }
    const m = item as Record<string, unknown>;
    const key = m.key as Record<string, unknown> | undefined;
    if (!key) {
      bumpSkip(skips, "missing_key");
      console.warn("[evolution-webhook] candidato sem key (ignorado)", Object.keys(m).slice(0, 8).join(","));
      continue;
    }
    if (isFromMeTrue(key)) {
      bumpSkip(skips, "from_me");
      continue;
    }

    const remoteJid = String(key.remoteJid ?? "");
    if (!remoteJid || remoteJid.includes("@g.us")) {
      bumpSkip(skips, "group_or_empty_jid");
      continue;
    }

    const mid = String(key.id ?? "");
    if (!mid) {
      bumpSkip(skips, "missing_message_id");
      continue;
    }

    const digits = remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
    const phone = digits.length > 0 ? `+${digits}` : remoteJid;
    const profileName = typeof m.pushName === "string" ? m.pushName : undefined;

    const msg = peelBaileysMessageLayers(m.message as Record<string, unknown> | undefined);
    const messageType = String(m.messageType ?? "").toLowerCase();

    const media = extractBaileysMedia(msg);
    if (media) {
      const rawMessage = m as Record<string, unknown>;
      if (media.kind === "image") {
        out.push({
          phone,
          textBody: media.textBody,
          externalId: mid,
          profileName,
          contentType: "image",
          rawMessage,
          ...(media.b64 && { imageBase64: media.b64, imageMimetype: media.mt }),
        });
      } else if (media.kind === "video") {
        out.push({
          phone,
          textBody: media.textBody,
          externalId: mid,
          profileName,
          contentType: "video",
          rawMessage,
          ...(media.b64 && { videoBase64: media.b64, videoMimetype: media.mt }),
        });
      } else if (media.kind === "document") {
        out.push({
          phone,
          textBody: media.textBody,
          externalId: mid,
          profileName,
          contentType: "document",
          rawMessage,
          ...(media.b64 && { documentBase64: media.b64, documentMimetype: media.mt }),
        });
      } else {
        out.push({
          phone,
          textBody: media.textBody,
          externalId: mid,
          profileName,
          contentType: "audio",
          rawMessage,
          ...(media.b64 && { audioBase64: media.b64, audioMimetype: media.mt }),
        });
      }
      continue;
    }

    // messageType às vezes indica mídia sem nós esperados (variantes Baileys)
    if (messageType === "imagemessage" && msg && (msg.imageMessage || msg.image)) {
      const im = (msg.imageMessage ?? msg.image) as Record<string, unknown>;
      if (typeof im === "object") {
        out.push({
          phone,
          textBody: (im.caption as string | undefined) ? String(im.caption) : "[Imagem]",
          externalId: mid,
          profileName,
          contentType: "image",
          rawMessage: m as Record<string, unknown>,
          ...((im.base64 as string | undefined) && {
            imageBase64: im.base64 as string,
            imageMimetype: im.mimetype as string | undefined,
          }),
        });
        continue;
      }
    }

    let textBody = "";
    if (msg?.conversation !== undefined && msg.conversation !== null) {
      textBody = String(msg.conversation);
    } else if (msg?.extendedTextMessage && typeof msg.extendedTextMessage === "object") {
      textBody = String((msg.extendedTextMessage as { text?: string }).text ?? "");
    } else if (msg) {
      const stPart = extractStickerMedia(msg.stickerMessage ?? msg.sticker);
      if (stPart) {
        out.push({
          phone,
          textBody: "[Sticker]",
          externalId: mid,
          profileName,
          contentType: "image",
          rawMessage: m as Record<string, unknown>,
          ...(stPart.b64 && { imageBase64: stPart.b64, imageMimetype: stPart.mt }),
        });
        continue;
      }
      textBody = `[${Object.keys(msg)[0] ?? "mensagem"}]`;
    }

    out.push({
      phone,
      textBody: textBody.trim() || "[vazio]",
      externalId: mid,
      profileName,
    });
  }

  const content_type_counts: Record<string, number> = {};
  for (const it of out) {
    const ct = it.contentType ?? "text";
    content_type_counts[ct] = (content_type_counts[ct] ?? 0) + 1;
  }

  return {
    items: out,
    diagnostic: {
      event_raw: eventRaw,
      upsert_matched,
      candidate_count,
      items_normalized: out.length,
      content_type_counts,
      chatwoot_enriched_payload: payloadMentionsChatwoot(body),
      skips,
      data_shape,
      data_keys_sample,
    },
  };
}

/** URL pública conforme o backend onde o ficheiro foi gravado (evita link MinIO quando o fallback foi Storage). */
function messageMediaPublicUrlForBackend(
  supabase: SupabaseClient,
  path: string,
  backend: "s3" | "storage",
): string {
  if (backend === "s3") return publicUrlForS3Object(S3_BUCKET_MESSAGE(), path);
  const { data: pub } = supabase.storage.from("message-media").getPublicUrl(path);
  return pub.publicUrl;
}

async function uploadToStorageWithRetry(
  supabase: SupabaseClient,
  path: string,
  bin: Uint8Array,
  contentType: string,
): Promise<"s3" | "storage" | false> {
  if (s3MediaConfigured() && !s3EdgePutDisabled()) {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await s3PutObject(S3_BUCKET_MESSAGE(), path, bin, contentType);
        return "s3";
      } catch (e) {
        lastErr = e;
        console.error("[evolution-media] S3 PUT tentativa", attempt, String(e).slice(0, 200));
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
    console.warn(
      "[evolution-media] S3 falhou — fallback Supabase Storage (message-media)",
      String(lastErr).slice(0, 180),
    );
  } else if (s3MediaConfigured() && s3EdgePutDisabled()) {
    console.log("[evolution-media] S3_MEDIA_DISABLE_EDGE_PUT — só Storage para esta gravação");
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage.from("message-media").upload(path, bin, {
      contentType,
      upsert: false,
    });
    if (!error) return "storage";
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

/** Decodifica base64 da Evolution/webhook (data URL, espaços, quebras de linha). */
function decodeBase64ToBytes(base64: string): Uint8Array | null {
  try {
    const t = base64.trim().replace(/\s/g, "");
    const comma = t.indexOf(",");
    const b64 = t.startsWith("data:") && comma >= 0 ? t.slice(comma + 1) : t;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (e) {
    console.error("[evolution-media] base64 decode failed", String(e));
    return null;
  }
}

async function uploadAudioBase64(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
  base64: string,
  mimetype?: string,
): Promise<Array<{ url: string; mime_type: string }> | null> {
  try {
    const bin = decodeBase64ToBytes(base64);
    if (!bin) return null;
    const ext = mimetype?.includes("ogg") ? "ogg" : mimetype?.includes("mpeg") ? "mp3" : "bin";
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const ct = mimetype ?? "audio/ogg";
    const backend = await uploadToStorageWithRetry(supabase, path, bin, ct);
    if (!backend) return null;
    return [{ url: messageMediaPublicUrlForBackend(supabase, path, backend), mime_type: ct }];
  } catch {
    return null;
  }
}

/** Upload de mídia (imagem/vídeo/documento) quando webhook_base64=true. */
async function uploadMediaBase64(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
  base64: string,
  mimetype: string,
): Promise<Array<{ url: string; mime_type: string }> | null> {
  try {
    const bin = decodeBase64ToBytes(base64);
    if (!bin) return null;
    const ext = extFromMimetype(mimetype);
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const ct = mimetype.split(";")[0].trim() || "application/octet-stream";
    const backend = await uploadToStorageWithRetry(supabase, path, bin, ct);
    if (!backend) return null;
    return [{ url: messageMediaPublicUrlForBackend(supabase, path, backend), mime_type: ct }];
  } catch {
    return null;
  }
}

/** Extensão de ficheiro a partir do mimetype. */
function extFromMimetype(mt: string | undefined): string {
  if (!mt) return "bin";
  const m = mt.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("3gpp") || m.includes("3gp")) return "3gp";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "bin";
}

function extractMediaUrlFromRawMessage(rawMessage: Record<string, unknown>): string | null {
  let msg = rawMessage.message as Record<string, unknown> | undefined;
  msg = peelBaileysMessageLayers(msg);
  if (!msg) return null;
  const candidates: Array<Record<string, unknown> | undefined> = [
    msg.stickerMessage as Record<string, unknown> | undefined,
    msg.sticker as Record<string, unknown> | undefined,
    msg.imageMessage as Record<string, unknown> | undefined,
    msg.videoMessage as Record<string, unknown> | undefined,
    msg.documentMessage as Record<string, unknown> | undefined,
    msg.image as Record<string, unknown> | undefined,
    msg.video as Record<string, unknown> | undefined,
    msg.document as Record<string, unknown> | undefined,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const url = c.url ?? c.mediaUrl ?? c.directPath;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

const REMOTE_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

/** Baixa URL pública (ex. CDN WhatsApp) na Edge e grava no nosso S3/Storage — o browser não consegue mostrar mmg.whatsapp.net no <img>. */
async function fetchRemoteUrlToOurStorage(
  supabase: SupabaseClient,
  remoteUrl: string,
  orgId: string,
  conversationId: string,
  fallbackMime: string,
): Promise<Array<{ url: string; mime_type: string }> | null> {
  const u = remoteUrl.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 28000);
    const res = await fetch(u, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentsLabs/1.0; +https://supabase.com)",
        Accept: "*/*",
      },
    });
    clearTimeout(to);
    if (!res.ok) {
      console.error("[evolution-media] remote fetch HTTP", res.status, u.slice(0, 120));
      return null;
    }
    const len = res.headers.get("content-length");
    if (len && parseInt(len, 10) > REMOTE_MEDIA_MAX_BYTES) {
      console.error("[evolution-media] remote file too large", len);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > REMOTE_MEDIA_MAX_BYTES) {
      console.error("[evolution-media] body too large", buf.length);
      return null;
    }
    const hdrCt = res.headers.get("content-type")?.split(";")[0].trim();
    const ct = hdrCt && hdrCt !== "application/octet-stream" ? hdrCt : fallbackMime;
    const mimeMain = ct.split(";")[0].trim();
    const ext = extFromMimetype(mimeMain);
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const backend = await uploadToStorageWithRetry(supabase, path, buf, mimeMain);
    if (!backend) return null;
    const publicUrl = messageMediaPublicUrlForBackend(supabase, path, backend);
    console.log("[evolution-media] rehosted remote →", publicUrl.slice(0, 80));
    return [{ url: publicUrl, mime_type: mimeMain }];
  } catch (e) {
    console.error("[evolution-media] fetchRemoteUrlToOurStorage", String(e), remoteUrl.slice(0, 80));
    return null;
  }
}

/** Busca mídia (imagem, vídeo, documento, áudio) via Evolution API e grava em S3/Storage. */
async function fetchEvolutionMediaAndUpload(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  rawMessage: Record<string, unknown>,
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
  defaultMimetype = "application/octet-stream",
): Promise<Array<{ url: string; mime_type: string }> | null> {
  const key = rawMessage.key as Record<string, unknown> | undefined;
  const keyId = key?.id as string | undefined;
  if (!keyId) {
    console.error("[evolution-media] missing key.id in rawMessage");
    return null;
  }
  const apiUrl = `${baseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;
  // A Evolution exige message.key; muitas instâncias precisam de remoteJid/fromMe, não só id (doc + issues #1250).
  const payloads: Record<string, unknown>[] = [];
  if (key && typeof key === "object") {
    payloads.push({ message: { key }, convertToMp4: false });
  }
  payloads.push({ message: { key: { id: keyId } }, convertToMp4: false });
  payloads.push({ message: rawMessage, convertToMp4: false });
  for (const bodyPayload of payloads) {
    try {
      const ac = new AbortController();
      const apiTo = setTimeout(() => ac.abort(), 25000);
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(bodyPayload),
        signal: ac.signal,
      });
      clearTimeout(apiTo);
      const json = (await res.json()) as Record<string, unknown>;
      const dataObj = json.data as Record<string, unknown> | undefined;
      const msgObj = dataObj?.message as Record<string, unknown> | undefined;
      const base64 = (json.base64 ?? dataObj?.base64 ?? msgObj?.base64) as string | undefined;
      const mimetype = (json.mimetype ?? dataObj?.mimetype ?? msgObj?.mimetype) as string | undefined;
      if (!res.ok) {
        console.error("[evolution-media] API error", res.status, JSON.stringify(json).slice(0, 300));
        continue;
      }
      if (!base64 || typeof base64 !== "string") {
        console.error("[evolution-media] no base64 in response", Object.keys(json));
        continue;
      }
      const bin = decodeBase64ToBytes(base64);
      if (!bin) continue;
      const ext = extFromMimetype(mimetype);
      const path = `${orgId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
      const ct = (mimetype || defaultMimetype).split(";")[0].trim();
      const backend = await uploadToStorageWithRetry(supabase, path, bin, ct);
      if (backend) {
        return [{ url: messageMediaPublicUrlForBackend(supabase, path, backend), mime_type: ct }];
      }
      continue;
    } catch (e) {
      console.error("[evolution-media] fetch/upload error", String(e));
      continue;
    }
  }
  console.error("[evolution-media] all payloads failed for key.id", keyId);
  const fallbackUrl = extractMediaUrlFromRawMessage(rawMessage);
  if (fallbackUrl) {
    const rehosted = await fetchRemoteUrlToOurStorage(
      supabase,
      fallbackUrl,
      orgId,
      conversationId,
      defaultMimetype,
    );
    if (rehosted) return rehosted;
    console.warn("[evolution-media] keeping external URL (rehost failed; UI pode não pré-visualizar)", fallbackUrl.slice(0, 80));
    return [{ url: fallbackUrl, mime_type: defaultMimetype }];
  }
  return null;
}

async function processInboundBatch(
  supabase: SupabaseClient,
  channel: ChannelRow,
  items: NormalizedInbound[],
  traceId?: string,
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
    const hasEvolutionConfig = !!(baseUrl && apiKey && instanceName);
    if (contentType === "audio") {
      if (it.audioBase64) {
        const media = await uploadAudioBase64(supabase, channel.organization_id, conversationId, it.audioBase64, it.audioMimetype);
        if (media) attachments = media;
      } else if (it.rawMessage && hasEvolutionConfig) {
        const media = await fetchEvolutionMediaAndUpload(
          baseUrl,
          apiKey,
          instanceName,
          it.rawMessage,
          supabase,
          channel.organization_id,
          conversationId,
          "audio/ogg",
        );
        if (media) attachments = media;
      } else if (!it.audioBase64 && !hasEvolutionConfig) {
        console.error("[evolution-audio] config incompleto: base_url, api_key e instance_name necessários em channel.config.evolution");
      }
    } else if (contentType === "image" || contentType === "video" || contentType === "document") {
      const defaultMt =
        contentType === "image"
          ? "image/jpeg"
          : contentType === "video"
          ? "video/mp4"
          : "application/octet-stream";
      if (contentType === "image" && it.imageBase64) {
        const media = await uploadMediaBase64(
          supabase,
          channel.organization_id,
          conversationId,
          it.imageBase64,
          it.imageMimetype ?? defaultMt,
        );
        if (media) attachments = media;
      } else if (contentType === "video" && it.videoBase64) {
        const media = await uploadMediaBase64(
          supabase,
          channel.organization_id,
          conversationId,
          it.videoBase64,
          it.videoMimetype ?? defaultMt,
        );
        if (media) attachments = media;
      } else if (contentType === "document" && it.documentBase64) {
        const media = await uploadMediaBase64(
          supabase,
          channel.organization_id,
          conversationId,
          it.documentBase64,
          it.documentMimetype ?? defaultMt,
        );
        if (media) attachments = media;
      } else if (it.rawMessage && hasEvolutionConfig) {
        const media = await fetchEvolutionMediaAndUpload(
          baseUrl,
          apiKey,
          instanceName,
          it.rawMessage,
          supabase,
          channel.organization_id,
          conversationId,
          defaultMt,
        );
        if (media) attachments = media;
      } else if (it.rawMessage && !hasEvolutionConfig) {
        const external = extractMediaUrlFromRawMessage(it.rawMessage);
        if (external) {
          const rehosted = await fetchRemoteUrlToOurStorage(
            supabase,
            external,
            channel.organization_id,
            conversationId,
            defaultMt,
          );
          if (rehosted) attachments = rehosted;
          else console.warn("[evolution-media] sem config Evolution API; rehost remoto falhou — defina base_url/api_key/instance_name");
        } else {
          console.warn("[evolution-media] sem config Evolution e sem URL de mídia no payload");
        }
      }
    }

    const hadWebhookB64 =
      (contentType === "image" && !!it.imageBase64) ||
      (contentType === "video" && !!it.videoBase64) ||
      (contentType === "document" && !!it.documentBase64) ||
      (contentType === "audio" && !!it.audioBase64);
    console.log(
      JSON.stringify({
        trace_id: traceId ?? null,
        evolution_inbound_save: {
          external_id: mid,
          content_type: contentType,
          attachment_count: attachments.length,
          had_webhook_base64: hadWebhookB64,
        },
      }),
    );
    if (
      ["image", "video", "document", "audio"].includes(contentType) &&
      attachments.length === 0
    ) {
      console.warn(
        JSON.stringify({
          trace_id: traceId ?? null,
          evolution_inbound_media_missing: {
            external_id: mid,
            content_type: contentType,
            hint: hasEvolutionConfig
              ? "getBase64FromMediaMessage falhou ou upload falhou — veja [evolution-media] no mesmo trace; ative webhook_base64 na Evolution ou confira se o servidor Evolution alcança MEDIA_PUBLIC_BASE_URL."
              : "defina evolution.base_url, api_key e instance_name na caixa",
          },
        }),
      );
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
        raw_type: ["audio", "image", "video", "document"].includes(contentType) ? contentType : "text",
        source: "evolution",
      },
    };
    if (attachments.length > 0) {
      insertPayload.attachments = attachments.map((a, i) => {
        const mt = a.mime_type ?? "application/octet-stream";
        const ext = extFromMimetype(mt);
        const prefix = contentType === "audio" ? "audio" : contentType === "image" ? "image" : contentType === "video" ? "video" : "file";
        return {
          url: a.url,
          full_url: a.url,
          mime_type: mt,
          file_name: `${prefix}-${Date.now()}-${i}.${ext}`,
        };
      });
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

    const traceId = crypto.randomUUID();
    const { items, diagnostic: inbound_diagnostic } = normalizeEvolutionInboundWithDiag(payload);

    console.log(
      JSON.stringify({
        trace_id: traceId,
        channel_id: channelId,
        evolution_normalize: inbound_diagnostic,
      }),
    );

    if (items.length === 0) {
      const ev = String(payload.event ?? "");
      if (/MESSAGES[_\s.-]*UPSERT/i.test(ev) || ev.toLowerCase().replace(/-/g, "_").includes("messages_upsert")) {
        const dk =
          payload.data && typeof payload.data === "object"
            ? Object.keys(payload.data as object).join(",")
            : "—";
        console.warn("[evolution-webhook] trace=", traceId, "upsert sem itens normalizados — data keys:", dk);
      }
    } else {
      await processInboundBatch(supabase, ch, items, traceId);
      await triggerDispatcherBestEffort();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: items.length,
        trace_id: traceId,
        inbound_diagnostic: inbound_diagnostic,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("evolution-whatsapp-webhook", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
