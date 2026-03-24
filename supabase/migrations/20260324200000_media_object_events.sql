-- Eventos de objeto MinIO/S3 (notificações de bucket) para auditoria e integrações.
-- Escritas: Edge Function `minio-media-webhook` com segredo dedicado (service role).

CREATE TABLE IF NOT EXISTS public.media_object_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  bucket_name text NOT NULL,
  object_key text NOT NULL,
  event_type text,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_media_object_events_created_at ON public.media_object_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_object_events_org ON public.media_object_events (organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_object_events_key ON public.media_object_events (bucket_name, object_key);

COMMENT ON TABLE public.media_object_events IS 'Notificações MinIO (ObjectCreated/Removed) — suporte e pipelines; RLS sem políticas para utilizadores.';

ALTER TABLE public.media_object_events ENABLE ROW LEVEL SECURITY;
