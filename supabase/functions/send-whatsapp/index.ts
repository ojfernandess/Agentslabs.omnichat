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

function inferMimeFromAttachmentUrl(url: string): string | undefined {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".pdf")) return "application/pdf";
  return undefined;
}

function inferFileNameFromUrl(url: string, fallback: string): string {
  try {
    const seg = url.split("?")[0].split("/").filter(Boolean).pop();
    if (seg && /\.[a-z0-9]{2,8}$/i.test(seg)) return seg;
  } catch {
    /* ignore */
  }
  return fallback;
}

function uint8ToBase64(u8: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * A Evolution aceita URL ou base64, mas o servidor Evolution muitas vezes não alcança URLs
 * (MinIO interno, só assinatura, firewall). Buscamos na Edge (mesma rede que o storage) e
 * enviamos data URL para imagens/documentos pequenos.
 */
async function resolveEvolutionMediaPayload(
  attachmentUrl: string,
  mimetype: string,
  mediatypeLower: string,
): Promise<string> {
  const t = attachmentUrl.trim();
  if (t.startsWith("data:") || (!t.startsWith("http://") && !t.startsWith("https://"))) {
    return t;
  }
  const maxBytes =
    mediatypeLower === "image"
      ? 12 * 1024 * 1024
      : mediatypeLower === "document"
      ? 15 * 1024 * 1024
      : 0;
  if (maxBytes === 0) return t;
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 28000);
    const r = await fetch(t, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; AgentsLabs-Edge/1.0; +https://supabase.com)",
      },
    });
    clearTimeout(tid);
    if (!r.ok) {
      console.warn("[send-whatsapp] Evolution: prefetch mídia HTTP", r.status, t.slice(0, 96));
      return t;
    }
    const cl = r.headers.get("content-length");
    if (cl) {
      const n = parseInt(cl, 10);
      if (Number.isFinite(n) && n > maxBytes) return t;
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > maxBytes) return t;
    const mt = mimetype.split(";")[0].trim() || "application/octet-stream";
    const dataUrl = `data:${mt};base64,${uint8ToBase64(buf)}`;
    console.log(
      "[send-whatsapp] Evolution: mídia inline base64",
      JSON.stringify({ bytes: buf.length, was_url: true }),
    );
    return dataUrl;
  } catch (e) {
    console.warn("[send-whatsapp] Evolution: prefetch falhou, uso da URL original", String(e).slice(0, 120));
    return t;
  }
}

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

  let body: {
    channel_id?: string;
    to?: string;
    text?: string;
    content_type?: string;
    attachment_url?: string;
    /** MIME real do ficheiro (paridade Chatwoot / Evolution sendMedia). */
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

  const { channel_id, to, text, content_type, attachment_url, attachment_mime_type, attachment_file_name, template } = body;
  if (!channel_id || !to) {
    return new Response(JSON.stringify({ error: "channel_id e to são obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const hasText = text && text.trim();
  const hasAudio = content_type === "audio" && attachment_url;
  const hasImage = content_type === "image" && attachment_url;
  const hasVideo = content_type === "video" && attachment_url;
  const hasDocument = content_type === "document" && attachment_url;
  const hasTemplate = content_type === "template" && template?.name;
  const hasMedia = hasImage || hasVideo || hasDocument;
  if (!hasText && !hasAudio && !hasTemplate && !hasMedia) {
    return new Response(JSON.stringify({ error: "text, attachment_url (áudio/imagem/vídeo/documento) ou template são obrigatórios" }), {
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
    if (hasAudio) {
      const sendUrl = `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`;
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: waTo,
          audioMessage: { audio: attachment_url },
        }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Evolution API (áudio)", detail: resJson }), {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, evolution: resJson }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (hasMedia) {
      // OpenAPI lista "Image" / "Video" / "Document"; algumas builds aceitam minúsculas — tentar Pascal primeiro.
      const mediatypeLower = hasImage ? "image" : hasVideo ? "video" : "document";
      const mediatypePascal =
        mediatypeLower === "image" ? "Image" : mediatypeLower === "video" ? "Video" : "Document";
      const defaultMime = hasImage ? "image/jpeg" : hasVideo ? "video/mp4" : "application/pdf";
      const defaultFile = hasImage ? "image.jpg" : hasVideo ? "video.mp4" : "document.pdf";
      const mimetype =
        (attachment_mime_type && String(attachment_mime_type).split(";")[0].trim()) ||
        (attachment_url ? inferMimeFromAttachmentUrl(attachment_url) : undefined) ||
        defaultMime;
      const fileName =
        (attachment_file_name && String(attachment_file_name).trim()) ||
        (attachment_url ? inferFileNameFromUrl(attachment_url, defaultFile) : defaultFile);
      const cap = (text ?? "").trim();
      const mediaPayload = await resolveEvolutionMediaPayload(attachment_url!, mimetype, mediatypeLower);
      const sendUrl = `${baseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;
      const mediatypeVariants = [mediatypePascal, mediatypeLower];
      let resJson: Record<string, unknown> = {};
      let lastRes: Response | null = null;
      for (const mt of mediatypeVariants) {
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: waTo,
            mediatype: mt,
            mimetype,
            caption: cap.length > 0 ? cap : " ",
            media: mediaPayload,
            fileName,
          }),
        });
        lastRes = res;
        resJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) {
          return new Response(JSON.stringify({ ok: true, evolution: resJson }), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      }
      console.error(
        "[send-whatsapp] Evolution sendMedia failed",
        JSON.stringify({
          status: lastRes?.status,
          mediatype: mediatypeLower,
          media_inline: mediaPayload.startsWith("data:"),
          media_url_prefix: attachment_url ? String(attachment_url).slice(0, 140) : null,
          detail: resJson,
        }),
      );
      return new Response(
        JSON.stringify({ error: "Evolution API (mídia)", detail: resJson, status: lastRes?.status }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }
    if (hasTemplate) {
      return new Response(
        JSON.stringify({ error: "Templates são suportados apenas no WhatsApp Cloud API (Meta). Use um canal configurado com Meta." }),
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
        text: text!.trim(),
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

  let graphBody: Record<string, unknown>;
  if (hasTemplate) {
    const lang = (template!.language ?? "en").trim();
    const components: Array<Record<string, unknown>> = [];
    const bodyParams = template!.body_parameters ?? [];
    if (bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParams.map((p) => ({ type: "text", text: p })),
      });
    }
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "template",
      template: {
        name: template!.name.trim(),
        language: { code: lang },
        ...(components.length > 0 && { components }),
      },
    };
  } else if (hasAudio) {
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "audio",
      audio: { link: attachment_url },
    };
  } else if (hasImage) {
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "image",
      image: { link: attachment_url, caption: (text ?? "").trim() || undefined },
    };
  } else if (hasVideo) {
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "video",
      video: { link: attachment_url, caption: (text ?? "").trim() || undefined },
    };
  } else if (hasDocument) {
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "document",
      document: { link: attachment_url, caption: (text ?? "").trim() || undefined, filename: "document" },
    };
  } else {
    graphBody = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "text",
      text: { body: (text ?? "").trim() },
    };
  }

  const res = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphBody),
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
