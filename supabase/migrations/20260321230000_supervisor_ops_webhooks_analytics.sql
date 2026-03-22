-- Presença, satisfação, notificações operacionais, logs de webhook e Realtime
-- Idempotente (reexecução segura)

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS satisfaction_score SMALLINT CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 5));

-- Notificações para supervisores / admins (webhook morto, agente offline)
CREATE TABLE IF NOT EXISTS public.operational_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_notifications_org_created
  ON public.operational_notifications (organization_id, created_at DESC);

ALTER TABLE public.operational_notifications ENABLE ROW LEVEL SECURITY;

-- Histórico de falhas de entrega (webhook de saída)
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

-- Quem pode ver notificações operacionais
DROP POLICY IF EXISTS "Supervisors and admins view operational_notifications" ON public.operational_notifications;
DROP POLICY IF EXISTS "Supervisors mark notifications read" ON public.operational_notifications;
CREATE POLICY "Supervisors and admins view operational_notifications"
  ON public.operational_notifications FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = operational_notifications.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'supervisor')
    )
  );

CREATE POLICY "Supervisors mark notifications read"
  ON public.operational_notifications FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = operational_notifications.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = operational_notifications.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'supervisor')
    )
  );

-- Logs de webhook: mesmos papéis
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

-- Realtime (Supabase) — notificações em tempo real para supervisores
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Trigger: fila de webhook marcada como dead
CREATE OR REPLACE FUNCTION public.on_webhook_queue_dead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'dead' AND (OLD.status IS DISTINCT FROM 'dead') THEN
    INSERT INTO public.webhook_delivery_logs (
      organization_id, outbound_webhook_id, queue_id, event_name, status, http_status, error_excerpt
    ) VALUES (
      NEW.organization_id,
      NEW.outbound_webhook_id,
      NEW.id,
      NEW.event_name,
      'dead',
      NEW.last_http_status,
      LEFT(COALESCE(NEW.last_error, ''), 2000)
    );

    INSERT INTO public.operational_notifications (
      organization_id, notification_type, severity, title, body, metadata
    ) VALUES (
      NEW.organization_id,
      'webhook_delivery_failed',
      'error',
      'Falha definitiva em webhook de saída',
      'Um envio foi encerrado após esgotar tentativas. Verifique o endpoint e os logs.',
      jsonb_build_object(
        'queue_id', NEW.id,
        'outbound_webhook_id', NEW.outbound_webhook_id,
        'event_name', NEW.event_name,
        'last_error', NEW.last_error
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_queue_dead ON public.webhook_outbound_queue;
CREATE TRIGGER trg_webhook_queue_dead
  AFTER UPDATE OF status ON public.webhook_outbound_queue
  FOR EACH ROW
  EXECUTE PROCEDURE public.on_webhook_queue_dead();

-- Trigger: agente passou a offline (tinha estado online)
CREATE OR REPLACE FUNCTION public.on_agent_went_offline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'agent'
     AND COALESCE(OLD.status, '') = 'online'
     AND COALESCE(NEW.status, '') = 'offline'
  THEN
    INSERT INTO public.operational_notifications (
      organization_id, notification_type, severity, title, body, metadata
    ) VALUES (
      NEW.organization_id,
      'agent_offline',
      'warning',
      'Agente offline',
      COALESCE(NULLIF(TRIM(NEW.display_name), ''), 'Um agente') || ' está offline.',
      jsonb_build_object('member_id', NEW.id, 'user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_offline ON public.organization_members;
CREATE TRIGGER trg_member_offline
  AFTER UPDATE OF status ON public.organization_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.on_agent_went_offline();

-- Bucket para mídia processada (thumbnails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload message-media" ON storage.objects;
DROP POLICY IF EXISTS "Public read message-media" ON storage.objects;
DROP POLICY IF EXISTS "Users update own message-media" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own message-media" ON storage.objects;

CREATE POLICY "Authenticated upload message-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-media');

CREATE POLICY "Public read message-media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'message-media');

CREATE POLICY "Users update own message-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'message-media' AND auth.uid() = owner);

CREATE POLICY "Users delete own message-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'message-media' AND auth.uid() = owner);
