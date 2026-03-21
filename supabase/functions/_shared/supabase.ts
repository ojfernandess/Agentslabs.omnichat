import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function assertInternalAuth(req: Request): void {
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
