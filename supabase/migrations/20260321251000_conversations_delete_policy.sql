-- Allow members to delete conversations (messages cascade)
-- Idempotente: reexecução segura
DROP POLICY IF EXISTS "Members can delete conversations" ON public.conversations;
CREATE POLICY "Members can delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
