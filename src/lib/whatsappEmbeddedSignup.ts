/**
 * WhatsApp Embedded Signup — mesma lógica que Chatwoot (FB JS SDK + postMessage).
 * @see https://github.com/chatwoot/chatwoot/blob/develop/app/javascript/dashboard/routes/dashboard/settings/inbox/channels/whatsapp/utils.js
 * O redirect `dialog/oauth` sozinho não dispara o assistente WABA (mostra só perfil básico).
 */

export type EmbeddedSignupBusinessData = {
  business_id: string;
  waba_id: string;
  phone_number_id?: string;
};

export type EmbeddedSignupResult = {
  code: string;
  business: EmbeddedSignupBusinessData;
};

declare global {
  interface Window {
    FB?: {
      init: (opts: {
        appId: string;
        version: string;
        xfbml: boolean;
        autoLogAppEvents: boolean;
      }) => void;
      login: (
        cb: (response: { authResponse?: { code?: string }; error?: { message?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export function isValidEmbeddedBusinessData(
  data: unknown
): data is EmbeddedSignupBusinessData {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.business_id === 'string' &&
    o.business_id.length > 0 &&
    typeof o.waba_id === 'string' &&
    o.waba_id.length > 0
  );
}

async function loadFacebookSdk(): Promise<void> {
  if (window.FB) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar o SDK da Meta (facebook.com).'));
    document.body.appendChild(s);
  });
  for (let i = 0; i < 50 && !window.FB; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!window.FB) throw new Error('SDK Facebook indisponível após o carregamento.');
}

function initializeFacebook(appId: string, apiVersion: string): void {
  window.FB!.init({
    appId,
    autoLogAppEvents: true,
    xfbml: true,
    version: apiVersion,
  });
}

function initWhatsAppEmbeddedSignup(configId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    window.FB!.login(
      (response) => {
        if (response.authResponse?.code) {
          resolve(response.authResponse.code);
          return;
        }
        if (response.error) {
          reject(new Error(String((response.error as { message?: string }).message ?? 'Facebook login')));
          return;
        }
        reject(new Error('Login cancelado'));
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      }
    );
  });
}

type WaEmbeddedMessage = {
  type?: string;
  event?: string;
  data?: unknown;
  error_message?: string;
};

function parseMessageData(raw: unknown): WaEmbeddedMessage | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as WaEmbeddedMessage;
    if (typeof raw === 'object' && raw !== null) return raw as WaEmbeddedMessage;
  } catch {
    return null;
  }
  return null;
}

/**
 * Carrega o SDK, abre o fluxo Embedded Signup e devolve o código OAuth + dados WABA (evento FINISH).
 */
export async function launchWhatsAppEmbeddedSignupFlow(params: {
  appId: string;
  configId: string;
  graphVersion: string;
}): Promise<EmbeddedSignupResult> {
  await loadFacebookSdk();
  initializeFacebook(params.appId, params.graphVersion);

  const pending: {
    code: string | null;
    business: EmbeddedSignupBusinessData | null;
  } = { code: null, business: null };

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (code: string, business: EmbeddedSignupBusinessData) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve({ code, business });
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      reject(err);
    };

    const tryComplete = () => {
      if (pending.code && pending.business && isValidEmbeddedBusinessData(pending.business)) {
        finish(pending.code, pending.business);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      const msg = parseMessageData(event.data);
      if (!msg || msg.type !== 'WA_EMBEDDED_SIGNUP') return;

      const ev = msg.event;
      if (ev === 'FINISH' || ev === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        const inner = msg.data;
        if (isValidEmbeddedBusinessData(inner)) {
          pending.business = inner;
          tryComplete();
        } else {
          fail(new Error('Dados de negócio inválidos no Embedded Signup.'));
        }
        return;
      }
      if (ev === 'CANCEL') {
        fail(new Error('Inscrição cancelada na Meta.'));
        return;
      }
      if (ev === 'error') {
        fail(new Error(msg.error_message || 'Erro no Embedded Signup da Meta.'));
      }
    };

    window.addEventListener('message', onMessage);

    initWhatsAppEmbeddedSignup(params.configId)
      .then((code) => {
        pending.code = code;
        tryComplete();
      })
      .catch((e: Error) => fail(e));
  });
}
