-- Chatwoot-parity feature tables: audit, attributes, automation, macros, SLA, campaigns, help center, captain, roles, workflow, security.
-- Conversations: SLA due columns + optional policy FK.
-- Idempotente (reexecução segura)

CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organization_audit_logs_org_created ON public.organization_audit_logs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.custom_attribute_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('conversation', 'contact')),
  attribute_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('text', 'number', 'boolean', 'list')),
  list_options JSONB,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_type, attribute_key)
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  trigger JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_reply_minutes INT NOT NULL CHECK (first_reply_minutes > 0),
  resolution_minutes INT NOT NULL CHECK (resolution_minutes > 0),
  priority_filter TEXT,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
    CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'sent', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  message_body TEXT NOT NULL DEFAULT '',
  audience_filter JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.help_center_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS public.help_center_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.help_center_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS public.captain_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  api_base_url TEXT,
  api_key TEXT,
  model TEXT,
  system_prompt TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.org_role NOT NULL,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, role, permission_key)
);

CREATE TABLE IF NOT EXISTS public.workflow_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  notes TEXT,
  transitions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  require_2fa_for_admins BOOLEAN NOT NULL DEFAULT false,
  allowed_ip_cidrs TEXT[] NOT NULL DEFAULT '{}',
  session_timeout_minutes INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sla_policy_id UUID REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_first_reply_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at TIMESTAMPTZ;

ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_center_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_center_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captain_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members select audit logs" ON public.organization_audit_logs;
DROP POLICY IF EXISTS "Members insert audit logs" ON public.organization_audit_logs;
DROP POLICY IF EXISTS "cad_select" ON public.custom_attribute_definitions;
DROP POLICY IF EXISTS "cad_insert" ON public.custom_attribute_definitions;
DROP POLICY IF EXISTS "cad_update" ON public.custom_attribute_definitions;
DROP POLICY IF EXISTS "cad_delete" ON public.custom_attribute_definitions;
DROP POLICY IF EXISTS "ar_select" ON public.automation_rules;
DROP POLICY IF EXISTS "ar_insert" ON public.automation_rules;
DROP POLICY IF EXISTS "ar_update" ON public.automation_rules;
DROP POLICY IF EXISTS "ar_delete" ON public.automation_rules;
DROP POLICY IF EXISTS "macros_select" ON public.macros;
DROP POLICY IF EXISTS "macros_insert" ON public.macros;
DROP POLICY IF EXISTS "macros_update" ON public.macros;
DROP POLICY IF EXISTS "macros_delete" ON public.macros;
DROP POLICY IF EXISTS "sla_select" ON public.sla_policies;
DROP POLICY IF EXISTS "sla_insert" ON public.sla_policies;
DROP POLICY IF EXISTS "sla_update" ON public.sla_policies;
DROP POLICY IF EXISTS "sla_delete" ON public.sla_policies;
DROP POLICY IF EXISTS "camp_select" ON public.campaigns;
DROP POLICY IF EXISTS "camp_insert" ON public.campaigns;
DROP POLICY IF EXISTS "camp_update" ON public.campaigns;
DROP POLICY IF EXISTS "camp_delete" ON public.campaigns;
DROP POLICY IF EXISTS "hcc_select" ON public.help_center_categories;
DROP POLICY IF EXISTS "hcc_insert" ON public.help_center_categories;
DROP POLICY IF EXISTS "hcc_update" ON public.help_center_categories;
DROP POLICY IF EXISTS "hcc_delete" ON public.help_center_categories;
DROP POLICY IF EXISTS "hca_select" ON public.help_center_articles;
DROP POLICY IF EXISTS "hca_insert" ON public.help_center_articles;
DROP POLICY IF EXISTS "hca_update" ON public.help_center_articles;
DROP POLICY IF EXISTS "hca_delete" ON public.help_center_articles;
DROP POLICY IF EXISTS "cap_select" ON public.captain_settings;
DROP POLICY IF EXISTS "cap_insert" ON public.captain_settings;
DROP POLICY IF EXISTS "cap_update" ON public.captain_settings;
DROP POLICY IF EXISTS "rp_select" ON public.role_permissions;
DROP POLICY IF EXISTS "rp_insert" ON public.role_permissions;
DROP POLICY IF EXISTS "rp_update" ON public.role_permissions;
DROP POLICY IF EXISTS "rp_delete" ON public.role_permissions;
DROP POLICY IF EXISTS "ws_select" ON public.workflow_settings;
DROP POLICY IF EXISTS "ws_insert" ON public.workflow_settings;
DROP POLICY IF EXISTS "ws_update" ON public.workflow_settings;
DROP POLICY IF EXISTS "ss_select" ON public.security_settings;
DROP POLICY IF EXISTS "ss_insert" ON public.security_settings;
DROP POLICY IF EXISTS "ss_update" ON public.security_settings;

CREATE POLICY "Members select audit logs" ON public.organization_audit_logs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members insert audit logs" ON public.organization_audit_logs FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "cad_select" ON public.custom_attribute_definitions FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "cad_insert" ON public.custom_attribute_definitions FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "cad_update" ON public.custom_attribute_definitions FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "cad_delete" ON public.custom_attribute_definitions FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "ar_select" ON public.automation_rules FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ar_insert" ON public.automation_rules FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ar_update" ON public.automation_rules FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ar_delete" ON public.automation_rules FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "macros_select" ON public.macros FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "macros_insert" ON public.macros FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "macros_update" ON public.macros FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "macros_delete" ON public.macros FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "sla_select" ON public.sla_policies FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "sla_insert" ON public.sla_policies FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "sla_update" ON public.sla_policies FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "sla_delete" ON public.sla_policies FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "camp_select" ON public.campaigns FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "camp_insert" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "camp_update" ON public.campaigns FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "camp_delete" ON public.campaigns FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "hcc_select" ON public.help_center_categories FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hcc_insert" ON public.help_center_categories FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hcc_update" ON public.help_center_categories FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hcc_delete" ON public.help_center_categories FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "hca_select" ON public.help_center_articles FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hca_insert" ON public.help_center_articles FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hca_update" ON public.help_center_articles FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "hca_delete" ON public.help_center_articles FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "cap_select" ON public.captain_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "cap_insert" ON public.captain_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "cap_update" ON public.captain_settings FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "rp_select" ON public.role_permissions FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "rp_insert" ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "rp_update" ON public.role_permissions FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "rp_delete" ON public.role_permissions FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "ws_select" ON public.workflow_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ws_insert" ON public.workflow_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ws_update" ON public.workflow_settings FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "ss_select" ON public.security_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ss_insert" ON public.security_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "ss_update" ON public.security_settings FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

DROP TRIGGER IF EXISTS update_custom_attribute_definitions_updated_at ON public.custom_attribute_definitions;
CREATE TRIGGER update_custom_attribute_definitions_updated_at
  BEFORE UPDATE ON public.custom_attribute_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_macros_updated_at ON public.macros;
CREATE TRIGGER update_macros_updated_at
  BEFORE UPDATE ON public.macros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_sla_policies_updated_at ON public.sla_policies;
CREATE TRIGGER update_sla_policies_updated_at
  BEFORE UPDATE ON public.sla_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_help_center_articles_updated_at ON public.help_center_articles;
CREATE TRIGGER update_help_center_articles_updated_at
  BEFORE UPDATE ON public.help_center_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_captain_settings_updated_at ON public.captain_settings;
CREATE TRIGGER update_captain_settings_updated_at
  BEFORE UPDATE ON public.captain_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_workflow_settings_updated_at ON public.workflow_settings;
CREATE TRIGGER update_workflow_settings_updated_at
  BEFORE UPDATE ON public.workflow_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_security_settings_updated_at ON public.security_settings;
CREATE TRIGGER update_security_settings_updated_at
  BEFORE UPDATE ON public.security_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
