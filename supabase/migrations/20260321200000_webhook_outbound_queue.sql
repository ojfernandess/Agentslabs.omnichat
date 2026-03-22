-- Fila de entrega de webhooks de saída (Seção 19) + suporte a retries
-- Idempotente
DO $$ BEGIN
  CREATE TYPE public.webhook_delivery_status AS ENUM ('pending', 'delivered', 'dead');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.webhook_outbound_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outbound_webhook_id UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE,
  status public.webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_http_status INT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_due
  ON public.webhook_outbound_queue (next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE public.webhook_outbound_queue ENABLE ROW LEVEL SECURITY;
-- Sem políticas: apenas service_role (Edge Functions) acessa

DROP TRIGGER IF EXISTS update_webhook_outbound_queue_updated_at ON public.webhook_outbound_queue;
CREATE TRIGGER update_webhook_outbound_queue_updated_at
  BEFORE UPDATE ON public.webhook_outbound_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
