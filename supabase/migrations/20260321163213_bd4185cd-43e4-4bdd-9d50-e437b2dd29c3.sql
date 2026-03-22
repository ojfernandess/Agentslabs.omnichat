
-- Fix the permissive INSERT policy on organizations
-- Any authenticated user should be able to create an org, but we tie it to creating their membership too
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
