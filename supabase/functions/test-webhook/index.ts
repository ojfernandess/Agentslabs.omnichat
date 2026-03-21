/** Testa POST num webhook de saída (supervisor/admin). Monolítico para deploy. */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getAnonClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL / ANON_KEY");
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sign(secret: string, ts: number, body: string): Promise<{ sig: string; ts: string }> {
  const pre = `${ts}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pre));
  const hex = Array.from(new Uint8Array(raw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { sig: `sha256=${hex}`, ts: String(ts) };
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

  let body: { outbound_webhook_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const id = body.outbound_webhook_id?.trim();
  if (!id) {
    return new Response(JSON.stringify({ error: "outbound_webhook_id obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const client = getAnonClient(authHeader);
  const { data: userData, error: uErr } = await client.auth.getUser();
  const user = userData?.user;
  if (uErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: hook, error: hErr } = await client
    .from("outbound_webhooks")
    .select("id, url, secret, organization_id, is_active, custom_headers")
    .eq("id", id)
    .maybeSingle();

  if (hErr || !hook) {
    return new Response(JSON.stringify({ error: "Webhook não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: mem } = await client
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", hook.organization_id)
    .maybeSingle();

  const role = mem?.role as string | undefined;
  if (!role || !["owner", "admin", "supervisor"].includes(role)) {
    return new Response(JSON.stringify({ error: "Apenas supervisores ou administradores" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!hook.is_active) {
    return new Response(JSON.stringify({ error: "Webhook inativo" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rawBody = JSON.stringify({
    event: "test.connection",
    ping: true,
    sent_at: new Date().toISOString(),
  });
  const ts = Math.floor(Date.now() / 1000);
  const { sig, ts: tsStr } = await sign(hook.secret as string, ts, rawBody);
  const extra = (hook.custom_headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Platform-Webhooks-Test/1.0",
    "X-Platform-Signature": sig,
    "X-Platform-Timestamp": tsStr,
    "X-Platform-Delivery": `test-${crypto.randomUUID()}`,
    ...extra,
  };

  try {
    const res = await fetch(hook.url as string, {
      method: "POST",
      headers,
      body: rawBody,
    });
    const text = await res.text().catch(() => "");
    return new Response(
      JSON.stringify({
        ok: res.ok,
        http_status: res.status,
        response_excerpt: text.slice(0, 500),
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
