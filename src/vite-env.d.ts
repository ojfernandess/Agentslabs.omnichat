/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_META_APP_ID?: string;
  readonly VITE_META_OAUTH_REDIRECT_URI?: string;
  /** Facebook Login for Business → Configurations (WhatsApp Embedded Signup) */
  readonly VITE_META_EMBEDDED_SIGNUP_CONFIG_ID?: string;
  /** Graph API version for FB.init, ex.: v21.0 */
  readonly VITE_META_GRAPH_VERSION?: string;
  /** Opcional: redirect_uri exacto na troca do código do SDK (se a Graph falhar com o URL da página) */
  readonly VITE_META_EMBEDDED_TOKEN_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
