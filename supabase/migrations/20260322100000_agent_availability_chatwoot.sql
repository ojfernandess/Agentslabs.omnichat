-- Chatwoot parity: disponibilidade do agente e auto-offline
-- status: 'online' | 'busy' | 'offline'
-- auto_offline: quando true, marca offline ao fechar aba (já é o comportamento implícito)

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS auto_offline BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.organization_members.auto_offline IS 'Marcar offline automaticamente ao fechar a aba (estilo Chatwoot)';
