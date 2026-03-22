-- Token de acesso estilo Chatwoot: api_access_token para integrações via API
-- Pode ser copiado e reiniciado; mantém-se secreto.

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS api_access_token UUID DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.organization_members.api_access_token IS 'Token para API (estilo Chatwoot). Reiniciar gera novo e invalida o anterior.';
