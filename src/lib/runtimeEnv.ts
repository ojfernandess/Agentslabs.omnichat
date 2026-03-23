/**
 * URLs de runtime (build-time via Vite).
 * Permite apontar as Edge Functions para um host diferente do API Supabase
 * (ex.: funções no mesmo servidor que o frontend, atrás de um reverse proxy).
 */
export function getSupabaseUrl(): string {
  const u = import.meta.env.VITE_SUPABASE_URL;
  if (!u || typeof u !== 'string') {
    throw new Error('VITE_SUPABASE_URL não está definido');
  }
  return u.replace(/\/$/, '');
}

/**
 * Garante que a base termina em `.../functions/v1` e não em `.../functions/v1/nome-da-função`.
 * Se `VITE_SUPABASE_FUNCTIONS_URL` for copiada do URL de uma função (ex. meta-whatsapp-webhook),
 * chamadas como `getFunctionUrl('process-media')` viram `.../meta-whatsapp-webhook/process-media`
 * e o handler errado responde (ex.: "channel_id obrigatório na query").
 */
export function normalizeFunctionsBaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  return u.replace(/(\/functions\/v1)\/[^/]+$/, "$1");
}

/**
 * Base URL das Edge Functions (sem barra final).
 * - Se `VITE_SUPABASE_FUNCTIONS_URL` estiver definido, usa esse valor (modo local / proxy).
 * - Caso contrário: `{VITE_SUPABASE_URL}/functions/v1` (Supabase Cloud ou stack unificada).
 */
export function getFunctionsBaseUrl(): string {
  const custom = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (custom && typeof custom === 'string' && custom.trim().length > 0) {
    return normalizeFunctionsBaseUrl(custom);
  }
  return `${getSupabaseUrl()}/functions/v1`;
}

/** URL completa para invocar uma função pelo nome (ex.: `send-whatsapp`). */
export function getFunctionUrl(functionName: string): string {
  const name = functionName.replace(/^\//, '');
  return `${getFunctionsBaseUrl()}/${name}`;
}

/**
 * Base das Edge Functions usada só para upload de mídia (S3/MinIO no Easypanel).
 * Se `VITE_EXTERNAL_MEDIA_UPLOAD_URL` estiver definido, usa esse valor; senão `getFunctionsBaseUrl()`.
 */
export function getMediaUploadFunctionsBaseUrl(): string {
  const custom = import.meta.env.VITE_EXTERNAL_MEDIA_UPLOAD_URL;
  if (custom && typeof custom === 'string' && custom.trim().length > 0) {
    return normalizeFunctionsBaseUrl(custom);
  }
  return getFunctionsBaseUrl();
}

/** URL do endpoint `upload-media` (multipart, autenticado). */
export function getUploadMediaUrl(): string {
  return `${getMediaUploadFunctionsBaseUrl()}/upload-media`;
}

/**
 * Quando true, anexos de conversa e avatares de inbox usam MinIO/S3 via função `upload-media`
 * em vez do Supabase Storage do projeto (útil com Supabase Cloud + armazenamento no Easypanel).
 */
export function useExternalMediaStorage(): boolean {
  const v = import.meta.env.VITE_EXTERNAL_MEDIA_STORAGE;
  return v === 'true' || v === '1';
}
