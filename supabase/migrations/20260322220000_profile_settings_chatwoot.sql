-- Configurações do perfil estilo Chatwoot
-- organization_members: full_name, message_signature, ui_settings

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS message_signature TEXT,
  ADD COLUMN IF NOT EXISTS ui_settings JSONB DEFAULT '{}';

COMMENT ON COLUMN public.organization_members.full_name IS 'Nome completo (estilo Chatwoot)';
COMMENT ON COLUMN public.organization_members.message_signature IS 'Assinatura pessoal ao final das mensagens';
COMMENT ON COLUMN public.organization_members.ui_settings IS 'Preferências: font_size, language, composer_mod_key (enter | mod_enter)';
