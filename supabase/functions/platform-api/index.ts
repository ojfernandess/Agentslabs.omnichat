/**
 * Platform API — compatível com Chatwoot Platform APIs
 * Permite provisionar Accounts (organizações), Users e AccountUsers via api_access_token.
 *
 * Refs:
 * - https://github.com/chatwoot/chatwoot/wiki/Building-on-Top-of-Chatwoot:-Platform-APIs
 * - https://developers.chatwoot.com/contributing-guide/chatwoot-platform-apis
 *
 * Autenticação: header api_access_token com o token da Platform App (Super Admin → Platform Apps)
 *
 * Endpoints:
 *   POST /platform/api/v1/accounts             → criar organização
 *   POST /platform/api/v1/users                → criar utilizador (Supabase Auth)
 *   POST /platform/api/v1/accounts/:id/account_users → associar user a organização
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, api_access_token",
};

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function validatePlatformToken(
  supabase: SupabaseClient,
  token: string | null
): Promise<{ valid: boolean; appId?: string }> {
  if (!token || token.length < 10) return { valid: false };
  const { data, error } = await supabase
    .from("platform_apps")
    .select("id")
    .eq("access_token", token)
    .maybeSingle();
  if (error || !data) return { valid: false };
  return { valid: true, appId: data.id };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "org-" + Date.now();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number, errors?: Array<{ field?: string; message: string }>) {
  return jsonResponse(
    errors ? { description: message, errors } : { description: message },
    status
  );
}

// POST /platform/api/v1/accounts
async function createAccount(supabase: SupabaseClient, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) return errorResponse("name is required", 400, [{ field: "name", message: "can't be blank" }]);

  const slug = String(body.domain ?? body.slug ?? "").trim() || slugify(name);
  const locale = String(body.locale ?? "pt").slice(0, 10);
  const supportEmail = typeof body.support_email === "string" ? body.support_email : null;

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name,
      slug: slug || `org-${Date.now()}`,
      settings: {
        locale,
        support_email: supportEmail,
        ...(typeof body.custom_attributes === "object" && body.custom_attributes ? (body.custom_attributes as object) : {}),
      },
    })
    .select("id, name, slug, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return errorResponse("Account with this slug already exists", 422);
    return errorResponse(error.message, 400);
  }

  return jsonResponse({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: "active",
    created_at: org.created_at,
  });
}

// POST /platform/api/v1/users
async function createUser(supabase: SupabaseClient, body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  const name = String(body.name ?? body.display_name ?? "").trim() || email.split("@")[0];
  const displayName = String(body.display_name ?? body.name ?? name).trim() || name;

  if (!email) return errorResponse("email is required", 400, [{ field: "email", message: "can't be blank" }]);
  if (!password || password.length < 8)
    return errorResponse("password must be at least 8 characters", 400, [{ field: "password", message: "is too short" }]);

  const { data: userData, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      display_name: displayName,
      ...(typeof body.custom_attributes === "object" && body.custom_attributes ? (body.custom_attributes as object) : {}),
    },
  });

  if (error) {
    if (error.message.includes("already been registered"))
      return errorResponse("User with this email already exists", 422);
    return errorResponse(error.message, 400);
  }

  const u = userData.user;
  return jsonResponse({
    id: u.id,
    uid: u.id,
    name,
    display_name: displayName,
    email: u.email,
    accounts: [],
    created_at: u.created_at,
  });
}

// Map Chatwoot roles to our org_role
function mapRole(cwRole: string): "owner" | "admin" | "supervisor" | "agent" {
  const r = String(cwRole ?? "agent").toLowerCase();
  if (r === "administrator" || r === "admin") return "admin";
  if (r === "supervisor") return "supervisor";
  return "agent";
}

// POST /platform/api/v1/accounts/:account_id/account_users
async function createAccountUser(
  supabase: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>
) {
  const userId = body.user_id;
  const role = String(body.role ?? "agent").toLowerCase();

  if (!userId) return errorResponse("user_id is required", 400, [{ field: "user_id", message: "can't be blank" }]);
  const uid = typeof userId === "string" ? userId : String(userId);

  const { data: userData } = await supabase.auth.admin.getUserById(uid);
  if (!userData?.user)
    return errorResponse("User not found", 404, [{ field: "user_id", message: "does not exist" }]);

  const { data: org } = await supabase.from("organizations").select("id").eq("id", accountId).maybeSingle();
  if (!org) return errorResponse("Account not found", 404, [{ field: "account_id", message: "does not exist" }]);

  const mappedRole = mapRole(role);
  const displayName = userData.user.user_metadata?.display_name ?? userData.user.user_metadata?.full_name ?? userData.user.email?.split("@")[0] ?? "Agent";

  const { data: member, error } = await supabase
    .from("organization_members")
    .insert({
      organization_id: accountId,
      user_id: uid,
      role: mappedRole,
      display_name: displayName,
    })
    .select("id, organization_id, user_id, role, display_name")
    .single();

  if (error) {
    if (error.code === "23505")
      return errorResponse("User is already a member of this account", 422);
    return errorResponse(error.message, 400);
  }

  return jsonResponse({
    account_id: member.organization_id,
    user_id: member.user_id,
    role: member.role,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = req.headers.get("api_access_token") ?? req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const supabase = getServiceClient();
  const { valid } = await validatePlatformToken(supabase, token);
  if (!valid) {
    return errorResponse("Invalid or missing api_access_token", 401);
  }

  const url = new URL(req.url);
  let path = url.pathname.replace(/\/+$/, "");
  // Supabase: /functions/v1/platform-api ou /functions/v1/platform-api/platform/api/v1/...
  const fnPrefix = "/functions/v1/platform-api";
  if (path.startsWith(fnPrefix)) path = path.slice(fnPrefix.length) || "/";
  const basePath = "/platform/api/v1";

  if (!path.startsWith(basePath)) {
    return errorResponse("Not found", 404);
  }

  const postAccounts = `${basePath}/accounts`;
  const postUsers = `${basePath}/users`;
  const accountUsersMatch = path.match(new RegExp(`^${basePath}/accounts/([^/]+)/account_users$`));

  if (req.method === "POST" && path === postAccounts) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    return createAccount(supabase, body);
  }

  if (req.method === "POST" && path === postUsers) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    return createUser(supabase, body);
  }

  if (req.method === "POST" && accountUsersMatch) {
    const accountId = accountUsersMatch[1];
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    return createAccountUser(supabase, accountId, body);
  }

  return errorResponse("Method not allowed or endpoint not found", 405);
});
