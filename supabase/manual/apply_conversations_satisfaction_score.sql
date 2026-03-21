-- Se GET em conversations com select=satisfaction_score devolver 400 (coluna inexistente).
-- Executar no SQL Editor; depois NOTIFY para o PostgREST atualizar o schema cache.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS satisfaction_score SMALLINT
  CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 5));

NOTIFY pgrst, 'reload schema';
