-- Executar no SQL Editor do Supabase quando GET /webhook_delivery_logs devolver 404.
-- Requer tabelas já criadas: organizations, outbound_webhooks, webhook_outbound_queue.

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outbound_webhook_id UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.webhook_outbound_queue(id) ON DELETE SET NULL,
  event_name TEXT,
  status TEXT NOT NULL,
  http_status INT,
  error_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_org
  ON public.webhook_delivery_logs (organization_id, created_at DESC);

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors view webhook_delivery_logs" ON public.webhook_delivery_logs;

CREATE POLICY "Supervisors view webhook_delivery_logs"
  ON public.webhook_delivery_logs FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = webhook_delivery_logs.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'supervisor')
    )
  );

NOTIFY pgrst, 'reload schema';
