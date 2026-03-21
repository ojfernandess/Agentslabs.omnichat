-- Criação atômica de organização + membro owner (evita 403 no SELECT pós-INSERT por RLS)
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name text,
  p_slug text
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations;
  v_display text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT COALESCE(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'full_name',
    email
  ) INTO v_display
  FROM auth.users
  WHERE id = auth.uid();

  INSERT INTO public.organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING * INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role, display_name)
  VALUES (v_org.id, auth.uid(), 'owner', v_display);

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text) TO authenticated;
