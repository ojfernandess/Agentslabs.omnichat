# Criar bucket message-media manualmente

O erro `Bucket not found` indica que o bucket `message-media` não existe no seu projeto Supabase.

## Via Supabase Dashboard

1. Aceda ao [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto
2. Vá em **Storage** no menu lateral
3. Clique em **New bucket**
4. Defina:
   - **Name:** `message-media`
   - **Public bucket:** Sim (ativado)
5. Clique em **Create bucket**

## Via SQL (Supabase SQL Editor)

No Dashboard → SQL Editor, execute:

```sql
INSERT INTO storage.buckets (id, name, public)
SELECT 'message-media', 'message-media', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'message-media');
```

Depois de criar o bucket, os áudios recebidos via Evolution API passarão a ser guardados e reproduzidos corretamente.
