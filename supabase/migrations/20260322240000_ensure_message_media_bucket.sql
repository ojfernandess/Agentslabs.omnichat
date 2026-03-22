-- Garante que o bucket message-media existe (requerido para áudio/imagens nas conversas)
-- Edge Functions usam SERVICE_ROLE que precisa que o bucket exista
INSERT INTO storage.buckets (id, name, public)
SELECT 'message-media', 'message-media', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'message-media');

-- Políticas para o bucket (recriar se necessário)
DROP POLICY IF EXISTS "Authenticated upload message-media" ON storage.objects;
CREATE POLICY "Authenticated upload message-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-media');

DROP POLICY IF EXISTS "Public read message-media" ON storage.objects;
CREATE POLICY "Public read message-media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'message-media');
