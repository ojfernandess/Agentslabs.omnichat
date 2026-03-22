-- Super admins podem ver todas as organizações (para o console)
-- Idempotente
DROP POLICY IF EXISTS "Super admins can view all organizations" ON public.organizations;
CREATE POLICY "Super admins can view all organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Super admins podem ver todos os organization_members (para contagens)
DROP POLICY IF EXISTS "Super admins can view all org members" ON public.organization_members;
CREATE POLICY "Super admins can view all org members"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_super_admin());
