/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Base das Edge Functions (ex. https://api.seudominio.com/functions/v1). Se vazio, usa VITE_SUPABASE_URL/functions/v1 */
  readonly VITE_SUPABASE_FUNCTIONS_URL?: string;
  /** supabase | selfhosted | local — informativo para documentação / futuras flags */
  readonly VITE_DEPLOYMENT_MODE?: string;
  /** true = anexos e avatares via função upload-media + S3/MinIO (Easypanel), não Supabase Storage */
  readonly VITE_EXTERNAL_MEDIA_STORAGE?: string;
  /** Base só para upload de mídia (ex. https://api.seudominio.com/functions/v1). Vazio = mesmo que funções. */
  readonly VITE_EXTERNAL_MEDIA_UPLOAD_URL?: string;
  /** Facebook Login for Business — App ID (injeta em build via vite.config; fallback legado: VITE_META_APP_ID) */
  readonly META_APP_ID: string;
  /** WhatsApp Embedded Signup — Configuration ID (Meta → Facebook Login for Business → Configurations); alinhado com Chatwoot WHATSAPP_CONFIGURATION_ID */
  readonly VITE_META_EMBEDDED_CONFIG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
