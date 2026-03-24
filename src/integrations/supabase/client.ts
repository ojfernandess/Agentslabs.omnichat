// Cliente Supabase com redirecionamento opcional das Edge Functions (VITE_SUPABASE_FUNCTIONS_URL).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getFunctionsBaseUrl, getSupabaseUrl } from '@/lib/runtimeEnv';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const defaultFunctionsPrefix = `${SUPABASE_URL}/functions/v1`;
const functionsBase = getFunctionsBaseUrl();
/** Só reescrever URLs quando há proxy real; caso contrário usar fetch nativo (evita 401 nas Edge Functions). */
const useFunctionsUrlRewrite = functionsBase !== defaultFunctionsPrefix;

function urlLooksLikeFunctionsV1(url: string): boolean {
  try {
    return new URL(url).pathname.includes('/functions/v1');
  } catch {
    return url.includes('/functions/v1');
  }
}

/** O gateway das Edge Functions do Supabase exige o header apikey (anon) além do Bearer. */
function mergeInitWithApiKeyForFunctions(url: string, init?: RequestInit): RequestInit | undefined {
  if (!urlLooksLikeFunctionsV1(url)) return init;
  const next = new Headers(init?.headers ?? {});
  if (!next.has('apikey')) {
    next.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  }
  return { ...init, headers: next };
}

/** Redireciona pedidos a /functions/v1 para o host configurado (modo local/proxy). */
const supabaseFetch: typeof fetch = (input, init) => {
  if (!useFunctionsUrlRewrite) {
    return fetch(input as RequestInfo | URL, init);
  }
  if (typeof input === 'string' && input.startsWith(defaultFunctionsPrefix)) {
    const target = input.replace(defaultFunctionsPrefix, functionsBase);
    return fetch(target, mergeInitWithApiKeyForFunctions(target, init));
  }
  if (input instanceof Request && input.url.startsWith(defaultFunctionsPrefix)) {
    const newUrl = input.url.replace(defaultFunctionsPrefix, functionsBase);
    // supabase-js pode passar um Request; só trocar a URL sem copiar headers remove o Bearer → 401.
    const h = new Headers(input.headers);
    if (urlLooksLikeFunctionsV1(newUrl) && !h.has('apikey')) {
      h.set('apikey', SUPABASE_PUBLISHABLE_KEY);
    }
    const hasBody = input.method !== 'GET' && input.method !== 'HEAD' && input.body != null;
    const rewritten = new Request(newUrl, {
      method: input.method,
      headers: h,
      body: hasBody ? input.body : undefined,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
      ...(hasBody ? { duplex: 'half' as const } : {}),
    });
    return fetch(rewritten, mergeInitWithApiKeyForFunctions(newUrl, init));
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