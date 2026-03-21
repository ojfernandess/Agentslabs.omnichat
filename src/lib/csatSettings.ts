import type { Json } from '@/integrations/supabase/types';

/** Estrutura alinhada ao Chatwoot: CSAT ao cliente após resolver, configurável na organização. */
export type CsatOrgSettings = {
  enabled: boolean;
  /** Texto enviado ao contacto (ex.: WhatsApp). Deve pedir resposta 1–5. */
  message: string;
};

const DEFAULT_MESSAGE =
  'Obrigado pelo contacto! Como avalia o nosso atendimento? Responda apenas com um número de 1 (muito insatisfeito) a 5 (muito satisfeito).';

export function parseCsatSettings(settings: Json | null | undefined): CsatOrgSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { enabled: false, message: DEFAULT_MESSAGE };
  }
  const raw = settings as Record<string, unknown>;
  const csat = raw.csat;
  if (!csat || typeof csat !== 'object' || Array.isArray(csat)) {
    return { enabled: false, message: DEFAULT_MESSAGE };
  }
  const c = csat as Record<string, unknown>;
  return {
    enabled: Boolean(c.enabled),
    message:
      typeof c.message === 'string' && c.message.trim().length > 0 ? c.message.trim() : DEFAULT_MESSAGE,
  };
}

export function mergeCsatIntoOrgSettings(
  base: Record<string, unknown> | null | undefined,
  csat: CsatOrgSettings
): Record<string, unknown> {
  const out = { ...(base ?? {}) };
  out.csat = {
    enabled: csat.enabled,
    message: csat.message,
  };
  return out;
}

export { DEFAULT_MESSAGE as DEFAULT_CSAT_MESSAGE };
