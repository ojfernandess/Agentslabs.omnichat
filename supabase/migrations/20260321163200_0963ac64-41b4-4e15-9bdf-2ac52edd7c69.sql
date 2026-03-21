
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. ORGANIZATIONS (Tenants)
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. ORGANIZATION MEMBERS
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'supervisor', 'agent');

CREATE TABLE public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'agent',
  display_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline',
  max_concurrent_chats INT DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. TEAMS
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, member_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 4. CHANNELS
CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'messenger', 'instagram', 'telegram', 'email', 'livechat', 'sms');

CREATE TABLE public.channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type channel_type NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- 5. CONTACTS
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  company TEXT,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_contacts_org ON public.contacts(organization_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);

-- 6. CONVERSATIONS
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'resolved', 'snoozed');
CREATE TYPE public.conversation_priority AS ENUM ('urgent', 'high', 'medium', 'low', 'none');

CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  status conversation_status NOT NULL DEFAULT 'open',
  priority conversation_priority NOT NULL DEFAULT 'none',
  subject TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  first_reply_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  custom_attributes JSONB DEFAULT '{}',
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_org ON public.conversations(organization_id);
CREATE INDEX idx_conversations_status ON public.conversations(organization_id, status);
CREATE INDEX idx_conversations_assignee ON public.conversations(assignee_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- 7. MESSAGES
CREATE TYPE public.message_type AS ENUM ('incoming', 'outgoing', 'activity', 'note');

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_id UUID,
  message_type message_type NOT NULL DEFAULT 'incoming',
  content TEXT,
  content_type TEXT DEFAULT 'text',
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

-- 8. CANNED RESPONSES
CREATE TABLE public.canned_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  short_code TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

-- 9. LABELS
CREATE TABLE public.labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id
$$;

-- RLS POLICIES
CREATE POLICY "Members can view their organizations" ON public.organizations FOR SELECT TO authenticated USING (id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Authenticated users can create organizations" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update their organizations" ON public.organizations FOR UPDATE TO authenticated USING (id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view org members" ON public.organization_members FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert into their orgs" ON public.organization_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update their own record" ON public.organization_members FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Members can view teams" ON public.teams FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update teams" ON public.teams FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can delete teams" ON public.teams FOR DELETE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view team members" ON public.team_members FOR SELECT TO authenticated USING (team_id IN (SELECT id FROM public.teams WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));
CREATE POLICY "Members can insert team members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (team_id IN (SELECT id FROM public.teams WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));
CREATE POLICY "Members can delete team members" ON public.team_members FOR DELETE TO authenticated USING (team_id IN (SELECT id FROM public.teams WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));

CREATE POLICY "Members can view channels" ON public.channels FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert channels" ON public.channels FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update channels" ON public.channels FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can delete channels" ON public.channels FOR DELETE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view conversations" ON public.conversations FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT TO authenticated USING (conversation_id IN (SELECT id FROM public.conversations WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));

CREATE POLICY "Members can view canned responses" ON public.canned_responses FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert canned responses" ON public.canned_responses FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update canned responses" ON public.canned_responses FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can delete canned responses" ON public.canned_responses FOR DELETE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

CREATE POLICY "Members can view labels" ON public.labels FOR SELECT TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can insert labels" ON public.labels FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update labels" ON public.labels FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Members can delete labels" ON public.labels FOR DELETE TO authenticated USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));

-- TRIGGERS
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_canned_responses_updated_at BEFORE UPDATE ON public.canned_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
