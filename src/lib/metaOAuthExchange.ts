import { supabase } from '@/integrations/supabase/client';
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
 * Usado no callback HTTP e no Embedded Signup (FB.login); o código expira em ~30s.
 */
export async function exchangeMetaOAuthCode(
  code: string,
  redirectUri: string,
  organizationId: string
): Promise<MetaOAuthChannelPayload> {
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) {
    throw new Error('Sessão expirada. Entre novamente.');
  }

  const res = await fetch(getFunctionUrl('meta-oauth-exchange'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      organization_id: organizationId,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((json as { error?: string }).error || 'Falha ao obter token Meta');
  }

  const verifyToken = crypto.randomUUID();
  return {
    waba_id: (json as { waba_id?: string | null }).waba_id ?? '',
    phone_number_id: (json as { phone_number_id?: string | null }).phone_number_id ?? '',
    access_token: (json as { access_token?: string }).access_token ?? '',
    verify_token: verifyToken,
    business_name: (json as { business_name?: string | null }).business_name ?? null,
  };
}
