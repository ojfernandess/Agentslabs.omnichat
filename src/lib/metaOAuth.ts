/**
 * OAuth Facebook / Meta para conectar conta Business ao WhatsApp Cloud API.
 * Documentação: https://developers.facebook.com/docs/whatsapp/embedded-signup
 * e Facebook Login: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 *
 * No Meta App → Facebook Login → Definições → URIs de redirecionamento OAuth válidos:
 *   ex.: https://seu-dominio.com/integrations/meta/callback
 *   dev: http://localhost:5173/integrations/meta/callback
 *
 * Embedded Signup (SDK + config_id): ver metaEmbeddedSignup.ts e
 * VITE_META_EMBEDDED_SIGNUP_CONFIG_ID (Facebook Login for Business → Configurations).
 */

export const META_OAUTH_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'business_management',
] as const;

const STORAGE_STATE = 'meta_oauth_state';
const STORAGE_ORG = 'meta_oauth_org_id';

export function getMetaAppId(): string | undefined {
  const id = import.meta.env.VITE_META_APP_ID as string | undefined;
  return id && id.length > 0 ? id : undefined;
}

export function getMetaOAuthRedirectUri(): string {
  const env = import.meta.env.VITE_META_OAUTH_REDIRECT_URI as string | undefined;
  if (env && env.length > 0) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/integrations/meta/callback`;
  }
  return '';
}

/** Inicia redirect para o diálogo OAuth da Meta (Cadastro incorporado / login Business). */
export function startMetaBusinessOAuth(organizationId: string): void {
  const appId = getMetaAppId();
  const redirectUri = getMetaOAuthRedirectUri();
  if (!appId) {
    throw new Error('Defina VITE_META_APP_ID no .env');
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_STATE, state);
  sessionStorage.setItem(STORAGE_ORG, organizationId);

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: [...META_OAUTH_SCOPES].join(','),
    auth_type: 'rerequest',
  });

  const url = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  window.location.href = url;
}

export function readAndClearOAuthSession(): { state: string | null; orgId: string | null } {
  const state = sessionStorage.getItem(STORAGE_STATE);
  const orgId = sessionStorage.getItem(STORAGE_ORG);
  sessionStorage.removeItem(STORAGE_STATE);
  sessionStorage.removeItem(STORAGE_ORG);
  return { state, orgId };
}

export const META_OAUTH_RESULT_KEY = 'META_WHATSAPP_OAUTH_RESULT';
