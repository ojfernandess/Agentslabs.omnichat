/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Facebook Login for Business — App ID (injeta em build via vite.config; fallback legado: VITE_META_APP_ID) */
  readonly META_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
