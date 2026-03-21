/**
 * Paridade conceptual com Chatwoot (estados, prioridade, caixa/atribuição, adiamento).
 * Referência API: https://developers.chatwoot.com/api-reference/introduction
 * Produto / help center: https://www.chatwoot.com/help-center
 */

import type { Database } from '@/integrations/supabase/types';

export type ConversationStatus = Database['public']['Enums']['conversation_status'];
export type ConversationPriority = Database['public']['Enums']['conversation_priority'];

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Aberta',
  pending: 'Pendente',
  resolved: 'Resolvida',
  snoozed: 'Adiada',
};

export const STATUS_HELP: Record<ConversationStatus, string> = {
  open: 'Conversa activa — em atendimento.',
  pending: 'À espera de resposta do contacto (equivalente a «waiting» no Chatwoot).',
  resolved: 'Encerrada; pode reabrir.',
  snoozed: 'Oculta até à data ou até nova mensagem do contacto.',
};

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  none: 'Normal',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const FILTER_TABS = [
  { id: 'all' as const, label: 'Todas' },
  { id: 'open' as const, label: 'Abertas' },
  { id: 'pending' as const, label: 'Pendentes' },
  { id: 'snoozed' as const, label: 'Adiadas' },
  { id: 'resolved' as const, label: 'Resolvidas' },
];

/** Valor para `<input type="datetime-local" />` no fuso do browser. */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pré-definições de adiamento (Chatwoot: snooze até data ou próxima mensagem). */
export function snoozeAtPreset(preset: '1h' | 'tomorrow' | 'week'): string {
  const d = new Date();
  if (preset === '1h') {
    d.setHours(d.getHours() + 1);
  } else if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  }
  return toDatetimeLocalValue(d);
}
