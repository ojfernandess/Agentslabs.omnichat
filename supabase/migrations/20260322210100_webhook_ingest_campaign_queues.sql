-- Filas duráveis para: (1) ACK rápido ao webhook Meta / picos; (2) envios de campanha com rate limit.
-- Processamento assíncrono via Edge Functions (ver docs/SCALING_WEBHOOKS_AND_CAMPAIGNS.md).

-- 1) Ingestão WhatsApp Cloud (Meta) — payload bruto após verificação de assinatura
CREATE TABLE IF NOT EXISTS public.webhook_ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_ingest_pending
  ON public.webhook_ingest_jobs (next_attempt_at, created_at)
  WHERE status = 'pending';

-- Só dedupe enquanto pending/processing (permite novo job após done/dead se a Meta voltar a enviar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_ingest_dedupe
  ON public.webhook_ingest_jobs (channel_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '' AND status IN ('pending', 'processing');

COMMENT ON TABLE public.webhook_ingest_jobs IS 'Fila de payloads Meta WhatsApp após ACK rápido; worker process-webhook-ingest.';

-- Claim atómico para workers (SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_webhook_ingest_jobs(p_limit INT DEFAULT 20)
RETURNS SETOF public.webhook_ingest_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.webhook_ingest_jobs j
  SET
    status = 'processing',
    started_at = COALESCE(j.started_at, now()),
    attempts = j.attempts + 1
  WHERE j.id IN (
    SELECT id FROM public.webhook_ingest_jobs
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_webhook_ingest_jobs(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_webhook_ingest_jobs(INT) TO service_role;

-- 2) Campanhas em massa — um job por destinatário (fan-out separado)
CREATE TABLE IF NOT EXISTS public.campaign_send_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  meta_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaign_send_pending
  ON public.campaign_send_jobs (organization_id, next_attempt_at)
  WHERE status IN ('pending', 'processing');

COMMENT ON TABLE public.campaign_send_jobs IS 'Fila rate-limited para campanhas WhatsApp; não dispare massa pela UI diretamente.';

ALTER TABLE public.webhook_ingest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_send_jobs ENABLE ROW LEVEL SECURITY;

-- Sem políticas: apenas service_role (bypass) e operações administrativas.
