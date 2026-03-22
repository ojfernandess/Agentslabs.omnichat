-- Super Admin Console (estilo Chatwoot): utilizadores com acesso a /super_admin
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Apenas super admins podem ver a lista
DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;
CREATE POLICY "Super admins can view super_admins"
  ON public.super_admins FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.super_admins));

-- Apenas super admins podem inserir novos (adicionar outros super admins)
DROP POLICY IF EXISTS "Super admins can insert super_admins" ON public.super_admins;
CREATE POLICY "Super admins can insert super_admins"
  ON public.super_admins FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.super_admins));

-- Backfill: primeiro owner vira super admin (se tabela vazia)
INSERT INTO public.super_admins (user_id)
SELECT om.user_id FROM public.organization_members om
WHERE om.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM public.super_admins LIMIT 1)
ORDER BY om.created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
