// Cliente Supabase com redirecionamento opcional das Edge Functions (VITE_SUPABASE_FUNCTIONS_URL).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getFunctionsBaseUrl, getSupabaseUrl } from '@/lib/runtimeEnv';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const defaultFunctionsPrefix = `${SUPABASE_URL}/functions/v1`;
const functionsBase = getFunctionsBaseUrl();

/** Redireciona pedidos a /functions/v1 para o host configurado (modo local/proxy). */
const supabaseFetch: typeof fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith(defaultFunctionsPrefix)) {
    return fetch(input.replace(defaultFunctionsPrefix, functionsBase), init);
  }
  if (input instanceof Request && input.url.startsWith(defaultFunctionsPrefix)) {
    return fetch(input.url.replace(defaultFunctionsPrefix, functionsBase), init);
  }
  return fetch(input, init);
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: supabaseFetch },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});