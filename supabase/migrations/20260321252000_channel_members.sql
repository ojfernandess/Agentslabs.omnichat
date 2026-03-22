-- Channel members: agents who can access this inbox.
-- Empty = all org members. When populated, only listed members can be assigned.
-- Idempotente
CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  organization_member_id UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, organization_member_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON public.channel_members(channel_id);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members select channel_members" ON public.channel_members;
DROP POLICY IF EXISTS "Admins insert channel_members" ON public.channel_members;
DROP POLICY IF EXISTS "Admins delete channel_members" ON public.channel_members;

CREATE POLICY "Members select channel_members"
  ON public.channel_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_members.channel_id
        AND c.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    )
  );

CREATE POLICY "Admins insert channel_members"
  ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channels c
      JOIN public.organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = channel_members.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins delete channel_members"
  ON public.channel_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      JOIN public.organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = channel_members.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
