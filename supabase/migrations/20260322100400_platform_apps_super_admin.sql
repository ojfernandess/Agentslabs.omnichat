-- Platform Apps (estilo Chatwoot): tokens de API para integração externa
-- Super admins criam apps em super_admin/platform_apps e obtêm access_token

CREATE TABLE IF NOT EXISTS public.platform_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  access_token TEXT NOT NULL UNIQUE DEFAULT ('sbp_' || encode(gen_random_bytes(24), 'hex')),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_apps_token ON public.platform_apps(access_token);

ALTER TABLE public.platform_apps ENABLE ROW LEVEL SECURITY;

-- Super admins podem ver e criar (via função)
DROP POLICY IF EXISTS "Super admins can manage platform_apps" ON public.platform_apps;
CREATE POLICY "Super admins can manage platform_apps"
  ON public.platform_apps FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Super admins podem listar todos (para UI; users continuam a ver só a própria linha)
DROP POLICY IF EXISTS "Super admins can list all super_admins" ON public.super_admins;
CREATE POLICY "Super admins can list all super_admins"
  ON public.super_admins FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Super admins podem remover outros super admins (DELETE)
DROP POLICY IF EXISTS "Super admins can delete super_admins" ON public.super_admins;
CREATE POLICY "Super admins can delete super_admins"
  ON public.super_admins FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Super admins podem ver a fila de webhooks (para monitorização)
DROP POLICY IF EXISTS "Super admins can view webhook_queue" ON public.webhook_outbound_queue;
CREATE POLICY "Super admins can view webhook_queue"
  ON public.webhook_outbound_queue FOR SELECT TO authenticated
  USING (public.is_super_admin());
