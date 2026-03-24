/**
 * Troca authorization code OAuth da Meta por access_token (server-side, com App Secret).
 * Verifica JWT Supabase + membership na organização.
 * Parceiros / Embedded Signup: mesmo fluxo; scopes extra podem ser pedidos no client (metaOAuth.ts).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getAnonClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL / ANON_KEY");
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

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

  let body: { code?: string; redirect_uri?: string; organization_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const code = body.code?.trim();
  const redirectUri = body.redirect_uri?.trim();
  const organizationId = body.organization_id?.trim();

  if (!code || !redirectUri || !organizationId) {
    return new Response(JSON.stringify({ error: "code, redirect_uri e organization_id obrigatórios" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = getAnonClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const svc = getServiceClient();
  const { data: member, error: memErr } = await svc
    .from("organization_members")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (memErr || !member) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta organização" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const appId = (Deno.env.get("META_APP_ID") ?? Deno.env.get("VITE_META_APP_ID"))?.trim();
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim();
  if (!appId || !appSecret) {
    const missing: string[] = [];
    if (!appId) missing.push("META_APP_ID (ou VITE_META_APP_ID)");
    if (!appSecret) missing.push("META_APP_SECRET");
    return new Response(
      JSON.stringify({
        error: `Secrets em falta: ${missing.join(", ")}.`,
        hint:
          "Supabase Dashboard → Project Settings → Edge Functions → Secrets, ou: supabase secrets set META_APP_ID=... META_APP_SECRET=...",
      }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const tokenUrl = new URL(`https://graph.facebook.com/v21.0/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tr = await fetch(tokenUrl.toString(), { method: "GET" });
  const tokenJson = await tr.json().catch(() => ({}));

  if (!tr.ok) {
    return new Response(
      JSON.stringify({ error: "Falha na troca do código Meta", detail: tokenJson }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const accessToken = String((tokenJson as { access_token?: string }).access_token ?? "");
  const expiresIn = Number((tokenJson as { expires_in?: number }).expires_in ?? 0);

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Resposta Meta sem access_token", detail: tokenJson }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let wabaId: string | null = null;
  let phoneNumberId: string | null = null;
  let businessName: string | null = null;

  try {
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("fields", "businesses{id,name,owned_whatsapp_business_accounts{id}}");
    meUrl.searchParams.set("access_token", accessToken);
    const meRes = await fetch(meUrl.toString());
    const meJson = await meRes.json().catch(() => ({})) as {
      businesses?: { data?: Array<{ id?: string; name?: string; owned_whatsapp_business_accounts?: { data?: Array<{ id?: string }> } }> };
    };
    const biz = meJson.businesses?.data?.[0];
    if (biz?.name) businessName = biz.name;
    const waba = biz?.owned_whatsapp_business_accounts?.data?.[0];
    if (waba?.id) {
      wabaId = String(waba.id);
      const pnUrl = new URL(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`);
      pnUrl.searchParams.set("access_token", accessToken);
      const pnRes = await fetch(pnUrl.toString());
      const pnJson = await pnRes.json().catch(() => ({})) as { data?: Array<{ id?: string }> };
      const first = pnJson.data?.[0];
      if (first?.id) phoneNumberId = String(first.id);
    }
  } catch (e) {
    console.error("meta-oauth-exchange discovery", e);
  }

  return new Response(
    JSON.stringify({
      access_token: accessToken,
      expires_in: expiresIn,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      business_name: businessName,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
