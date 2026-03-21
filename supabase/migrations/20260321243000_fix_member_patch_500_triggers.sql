-- PATCH organization_members devolvia 500 quando o INSERT em operational_notifications falhava
-- (ex.: RLS no INSERT mesmo em função SECURITY DEFINER, ou outro erro além de tabela em falta).
-- O heartbeat (status online/offline) não pode falhar por causa do alerta operacional.

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
    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_webhook_queue_dead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'dead' AND (OLD.status IS DISTINCT FROM 'dead') THEN
    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_organization_member_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'last_seen_at'
  ) THEN
    BEGIN
      NEW.last_seen_at := now();
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
