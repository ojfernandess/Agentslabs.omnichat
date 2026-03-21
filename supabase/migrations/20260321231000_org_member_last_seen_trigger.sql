-- Atualiza last_seen_at em cada UPDATE de organization_members (requer coluna da migration 20260321230000).
-- O cliente envia apenas status; assim o PATCH não falha em projetos sem last_seen_at.

CREATE OR REPLACE FUNCTION public.touch_organization_member_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'last_seen_at'
  ) THEN
    NEW.last_seen_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_org_member_touch_last_seen ON public.organization_members;
CREATE TRIGGER trg_org_member_touch_last_seen
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_organization_member_last_seen();
