import { supabase } from '@/integrations/supabase/client';
import { getFunctionUrl } from '@/lib/runtimeEnv';

/**
 * POST a uma Edge Function com JWT + apikey e timeout explícito (evita spinner infinito se o invoke ficar pendente).
 */
export async function invokeEdgeFunctionJson<T extends Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 75_000,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  const { data: s } = await supabase.auth.getSession();
  const jwt = s.session?.access_token;
  if (!jwt) return { data: null, error: new Error('Sessão expirada') };

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const url = getFunctionUrl(functionName);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        ...(apikey ? { apikey } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (typeof json.error === 'string' && json.error) ||
        (typeof json.message === 'string' && json.message) ||
        res.statusText ||
        'Erro na função';
      return { data: null, error: new Error(msg) };
    }
    return { data: json as T, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'AbortError') {
      return { data: null, error: new Error('Tempo esgotado ao contactar o servidor. Tente outra vez.') };
    }
    return { data: null, error: err };
  } finally {
    clearTimeout(to);
  }
}

/**
 * POST multipart (ex.: diagnóstico com ficheiro). Não definir Content-Type — o browser define boundary.
 */
export async function invokeEdgeFunctionFormData<T extends Record<string, unknown>>(
  functionName: string,
  formData: FormData,
  timeoutMs = 120_000,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  const { data: s } = await supabase.auth.getSession();
  const jwt = s.session?.access_token;
  if (!jwt) return { data: null, error: new Error('Sessão expirada') };

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const url = getFunctionUrl(functionName);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(apikey ? { apikey } : {}),
      },
      body: formData,
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (typeof json.error === 'string' && json.error) ||
        (typeof json.message === 'string' && json.message) ||
        res.statusText ||
        'Erro na função';
      return { data: null, error: new Error(msg) };
    }
    return { data: json as T, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'AbortError') {
      return { data: null, error: new Error('Tempo esgotado ao contactar o servidor. Tente outra vez.') };
    }
    return { data: null, error: err };
  } finally {
    clearTimeout(to);
  }
}
