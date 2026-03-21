-- Alinhado ao Chatwoot: snoozed_until quando status = snoozed (reabrir após ou na próxima mensagem).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

COMMENT ON COLUMN public.conversations.snoozed_until IS 'Quando status=snoozed: reactivar conversa após este instante (estilo Chatwoot).';
