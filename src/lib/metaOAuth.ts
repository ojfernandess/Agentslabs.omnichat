/**
 * OAuth Facebook / Meta para WhatsApp Cloud API.
 *
 * Alinhado com Chatwoot (WhatsApp Embedded Signup):
 * - Mesmos scopes quando não se usa Configuration ID: `whatsapp_business_management`,
 *   `whatsapp_business_messaging`, `business_management`.
 * - Com `VITE_META_EMBEDDED_CONFIG_ID`: usa Facebook Login for Business com variante
 *   "WhatsApp Embedded Signup" (Meta → Facebook Login for Business → Configurations),
 *   equivalente ao `WHATSAPP_CONFIGURATION_ID` do Chatwoot — recomendado em produção.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
 *
 * URIs de redirecionamento válidas (Meta App → Facebook Login):
 *   https://seu-dominio.com/integrations/meta/callback
 *   http://localhost:8080/integrations/meta/callback
 *
 * App ID: META_APP_ID (vite.config define).
 */

/** Mesmos pedidos que Chatwoot documenta para Embedded Signup. */
export const META_OAUTH_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'business_management',
] as const;

const STORAGE_STATE = 'meta_oauth_state';
const STORAGE_ORG = 'meta_oauth_org_id';

export function getMetaAppId(): string | undefined {
  const id = import.meta.env.META_APP_ID as string | undefined;
  return id && id.length > 0 ? id : undefined;
}

/**
 * Configuration ID do Meta (Facebook Login for Business → Configurations → WhatsApp Embedded Signup).
 * Com este valor, o diálogo OAuth usa `config_id` + `override_default_response_type` como na doc Meta / Chatwoot.
 */
export function getMetaEmbeddedConfigId(): string | undefined {
  const id = import.meta.env.VITE_META_EMBEDDED_CONFIG_ID as string | undefined;
  const t = typeof id === 'string' ? id.trim() : '';
  return t.length > 0 ? t : undefined;
}

/** URL exacta a registar no Meta App (OAuth redirect). */
export function getMetaOAuthRedirectUri(): string {
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
    throw new Error('Defina META_APP_ID no .env');
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_STATE, state);
  sessionStorage.setItem(STORAGE_ORG, organizationId);

  const embeddedConfigId = getMetaEmbeddedConfigId();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  });

  if (embeddedConfigId) {
    params.set('config_id', embeddedConfigId);
    params.set('override_default_response_type', 'true');
  } else {
    params.set('scope', [...META_OAUTH_SCOPES].join(','));
    params.set('auth_type', 'rerequest');
  }

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
