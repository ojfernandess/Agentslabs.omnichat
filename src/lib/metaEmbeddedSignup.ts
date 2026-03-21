/**
 * WhatsApp Embedded Signup v4 — SDK JS + FB.login(config_id) + eventos WA_EMBEDDED_SIGNUP.
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
 */
import { getMetaAppId } from '@/lib/metaOAuth';
import { exchangeMetaOAuthCode, type MetaOAuthChannelPayload } from '@/lib/metaOAuthExchange';

export function getMetaGraphSdkVersion(): string {
  const v = import.meta.env.VITE_META_GRAPH_VERSION as string | undefined;
  if (v && v.length > 0) return v.startsWith('v') ? v : `v${v}`;
  return 'v21.0';
}

/** Config ID: Facebook Login for Business → Configurations (template Embedded Signup). */
export function getMetaEmbeddedSignupConfigId(): string | undefined {
  const id = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string | undefined;
  return id && id.length > 0 ? id : undefined;
}

/**
 * redirect_uri na troca do código deve coincidir com o usado no diálogo do JS SDK
 * (normalmente a URL da página actual, sem hash).
 */
export function getMetaEmbeddedTokenExchangeRedirectUri(): string {
  const env = import.meta.env.VITE_META_EMBEDDED_TOKEN_REDIRECT_URI as string | undefined;
  if (env !== undefined && env.length > 0) return env.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') || window.location.origin;
}

type WaEmbeddedMessage = {
  type?: string;
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    business_id?: string;
  };
};

function parseWaEmbeddedMessage(event: MessageEvent): WaEmbeddedMessage | null {
  if (!event.origin.endsWith('facebook.com')) return null;
  try {
    const raw = typeof event.data === 'string' ? event.data : String(event.data);
    const data = JSON.parse(raw) as WaEmbeddedMessage;
    if (data.type === 'WA_EMBEDDED_SIGNUP') return data;
  } catch {
    /* ignore */
  }
  return null;
}

/** Escuta o primeiro evento FINISH* com dados de activos (WABA, número). */
function captureFinishAssetMessage(timeoutMs: number): Promise<WaEmbeddedMessage['data'] | null> {
  return new Promise((resolve) => {
    const done = (value: WaEmbeddedMessage['data'] | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const handler = (event: MessageEvent) => {
      const parsed = parseWaEmbeddedMessage(event);
      if (!parsed?.event) return;
      if (!String(parsed.event).startsWith('FINISH')) return;
      done(parsed.data ?? null);
    };
    window.addEventListener('message', handler);
  });
}

type FBLoginResponse = {
  authResponse?: { code?: string; accessToken?: string };
  status?: string;
};

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (resp: FBLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let facebookSdkLoad: Promise<void> | null = null;

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (!facebookSdkLoad) {
    facebookSdkLoad = new Promise((resolve, reject) => {
      window.fbAsyncInit = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onerror = () => {
        facebookSdkLoad = null;
        reject(new Error('Não foi possível carregar o SDK da Meta'));
      };
      document.body.appendChild(s);
    });
  }
  return facebookSdkLoad;
}

function initFacebookSdkOnce(appId: string, graphVersion: string): void {
  if (!window.FB) return;
  window.FB.init({
    appId,
    autoLogAppEvents: true,
    xfbml: true,
    version: graphVersion,
  });
}

function fbLoginEmbedded(configId: string): Promise<FBLoginResponse> {
  return new Promise((resolve) => {
    if (!window.FB) {
      resolve({});
      return;
    }
    window.FB.login(
      (response) => resolve(response ?? {}),
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    );
  });
}

function mergePayload(
  exchanged: MetaOAuthChannelPayload,
  assets: WaEmbeddedMessage['data'] | null
): MetaOAuthChannelPayload {
  if (!assets) return exchanged;
  return {
    ...exchanged,
    waba_id: assets.waba_id ?? exchanged.waba_id,
    phone_number_id: assets.phone_number_id ?? exchanged.phone_number_id,
  };
}

/**
 * Abre o fluxo Embedded Signup e devolve credenciais para a caixa WhatsApp.
 * Requer VITE_META_APP_ID e VITE_META_EMBEDDED_SIGNUP_CONFIG_ID.
 */
export async function launchMetaEmbeddedSignup(organizationId: string): Promise<MetaOAuthChannelPayload> {
  const appId = getMetaAppId();
  const configId = getMetaEmbeddedSignupConfigId();
  if (!appId) {
    throw new Error('Defina VITE_META_APP_ID no .env');
  }
  if (!configId) {
    throw new Error('Defina VITE_META_EMBEDDED_SIGNUP_CONFIG_ID (Facebook Login for Business → Configurations)');
  }

  await loadFacebookSdk();
  if (!window.FB) {
    throw new Error('SDK Meta indisponível');
  }
  initFacebookSdkOnce(appId, getMetaGraphSdkVersion());

  const finishPromise = captureFinishAssetMessage(180_000);
  const response = await fbLoginEmbedded(configId);

  if (!response.authResponse?.code) {
    throw new Error('Login Meta cancelado ou sem código. Tente de novo.');
  }

  const redirectUri = getMetaEmbeddedTokenExchangeRedirectUri();
  const exchanged = await exchangeMetaOAuthCode(response.authResponse.code, redirectUri, organizationId);

  /** FINISH pode chegar antes ou depois da troca do código; esperamos até 15s após a troca. */
  const assets = await Promise.race([
    finishPromise,
    new Promise<WaEmbeddedMessage['data'] | null>((r) => setTimeout(() => r(null), 15_000)),
  ]);

  return mergePayload(exchanged, assets);
}
