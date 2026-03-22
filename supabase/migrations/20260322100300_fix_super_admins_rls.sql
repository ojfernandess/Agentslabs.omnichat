-- Corrige recursão infinita nas políticas RLS de super_admins
-- A política anterior fazia SELECT em super_admins para verificar se o user é super admin,
-- o que disparava a mesma política e causava 500.

DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Super admins can insert super_admins" ON public.super_admins;
DROP POLICY IF EXISTS "Users can view own super_admin row" ON public.super_admins;

-- Cada utilizador pode ver apenas a sua própria linha (para useIsSuperAdmin)
CREATE POLICY "Users can view own super_admin row"
  ON public.super_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Função SECURITY DEFINER para verificar se o utilizador é super admin (sem disparar RLS)
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = check_user_id);
$$;

-- Apenas super admins podem inserir novos
DROP POLICY IF EXISTS "Super admins can insert super_admins" ON public.super_admins;
CREATE POLICY "Super admins can insert super_admins"
  ON public.super_admins FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
