import type { PostgrestError } from '@supabase/supabase-js';

/** Tabela ainda não existe no projeto remoto (migration não aplicada) — PostgREST devolve 404 / PGRST205. */
export function isMissingRestTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = String(error.code || '');
  const details = String((error as PostgrestError & { details?: string }).details ?? '').toLowerCase();
  const hint = String((error as PostgrestError & { hint?: string }).hint ?? '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('404') ||
    details.includes('404') ||
    hint.includes('schema cache')
  );
}

export const MISSING_TABLE_STORAGE_KEYS = {
  operationalNotifications: 'supabase_ops_notifications_table_missing',
  webhookDeliveryLogs: 'supabase_webhook_delivery_logs_table_missing',
} as const;

export function readMissingTableFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function setMissingTableFlag(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function clearMissingTableFlag(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Coluna pedida no select ainda não existe (migration não aplicada) — PostgREST 400 / PGRST204. */
export function isMissingColumnSelectError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find') && msg.includes('column')) ||
    msg.includes('unknown column')
  );
}
