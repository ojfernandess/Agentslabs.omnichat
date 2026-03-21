-- Extend channel types (API custom + LINE)
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'api';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'line';

-- Public token for widget / inbound API identification (Seção 17.2.7 / 17.2.8)
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS channels_public_token_idx ON public.channels(public_token);

-- Agent Bots (Seção 18)
CREATE TABLE public.agent_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  outgoing_webhook_url TEXT NOT NULL,
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_bots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.channel_agent_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  agent_bot_id UUID NOT NULL REFERENCES public.agent_bots(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id)
);
ALTER TABLE public.channel_agent_bots ENABLE ROW LEVEL SECURITY;

-- Webhooks de saída (Seção 19)
CREATE TABLE public.outbound_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  events TEXT[] NOT NULL DEFAULT '{}',
  custom_headers JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_status TEXT,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_agent_bots_updated_at
  BEFORE UPDATE ON public.agent_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outbound_webhooks_updated_at
  BEFORE UPDATE ON public.outbound_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: agent_bots
CREATE POLICY "Members can view agent_bots"
  ON public.agent_bots FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can insert agent_bots"
  ON public.agent_bots FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can update agent_bots"
  ON public.agent_bots FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can delete agent_bots"
  ON public.agent_bots FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

-- RLS: outbound_webhooks
CREATE POLICY "Members can view outbound_webhooks"
  ON public.outbound_webhooks FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can insert outbound_webhooks"
  ON public.outbound_webhooks FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can update outbound_webhooks"
  ON public.outbound_webhooks FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can delete outbound_webhooks"
  ON public.outbound_webhooks FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

-- RLS: channel_agent_bots (via channel org)
CREATE POLICY "Members can view channel_agent_bots"
  ON public.channel_agent_bots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_agent_bots.channel_id
        AND c.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Members can insert channel_agent_bots"
  ON public.channel_agent_bots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_agent_bots.channel_id
        AND c.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
    AND EXISTS (
      SELECT 1 FROM public.agent_bots b
      WHERE b.id = channel_agent_bots.agent_bot_id
        AND b.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Members can update channel_agent_bots"
  ON public.channel_agent_bots FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_agent_bots.channel_id
        AND c.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Members can delete channel_agent_bots"
  ON public.channel_agent_bots FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_agent_bots.channel_id
        AND c.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );
