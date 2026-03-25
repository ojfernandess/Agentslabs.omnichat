import { supabase } from '@/integrations/supabase/client';
import { generateWhatsAppWebhookVerifyToken } from '@/lib/metaOAuth';
import { getFunctionUrl } from '@/lib/runtimeEnv';

export type MetaOAuthChannelPayload = {
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  business_name: string | null;
};

/**
 * Troca o authorization code Meta por tokens (Edge Function meta-oauth-exchange).
 * - `redirectUri` preenchido: fluxo HTTP redirect (callback `/integrations/meta/callback`).
 * - `redirectUri` vazio + `embedded`: código do FB.login (WhatsApp Embedded Signup, como Chatwoot).
 */
export async function exchangeMetaOAuthCode(
  code: string,
  redirectUri: string | null | undefined,
  organizationId: string,
  embedded?: { waba_id?: string; phone_number_id?: string; business_id?: string }
): Promise<MetaOAuthChannelPayload> {
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) {
    throw new Error('Sessão expirada. Entre novamente.');
  }

  const payload: Record<string, unknown> = {
    code,
    organization_id: organizationId,
  };
  const ru = redirectUri?.trim();
  if (ru) payload.redirect_uri = ru;
  else payload.embedded_sdk = true;
  if (embedded && Object.keys(embedded).length > 0) payload.embedded = embedded;

  const res = await fetch(getFunctionUrl('meta-oauth-exchange'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((json as { error?: string }).error || 'Falha ao obter token Meta');
  }

  const verifyToken = generateWhatsAppWebhookVerifyToken();
  return {
    waba_id: (json as { waba_id?: string | null }).waba_id ?? '',
    phone_number_id: (json as { phone_number_id?: string | null }).phone_number_id ?? '',
    access_token: (json as { access_token?: string }).access_token ?? '',
    verify_token: verifyToken,
    business_name: (json as { business_name?: string | null }).business_name ?? null,
  };
}
