-- Corrige 42P17: infinite recursion detected in policy for relation "organization_members"
-- A política anterior usava EXISTS (SELECT ... FROM organization_members) dentro do próprio UPDATE em organization_members.

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "Owners and admins update member rows" ON public.organization_members;

CREATE POLICY "Owners and admins update member rows"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.current_user_is_org_admin(organization_id))
  WITH CHECK (public.current_user_is_org_admin(organization_id));
