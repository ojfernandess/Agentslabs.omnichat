import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMetaOAuthRedirectUri,
  META_OAUTH_RESULT_KEY,
  readAndClearOAuthSession,
} from '@/lib/metaOAuth';
import { exchangeMetaOAuthCode } from '@/lib/metaOAuthExchange';
import { toast } from 'sonner';

/**
 * Callback OAuth Meta — URL registada no Meta App (Facebook Login).
 * Após sucesso, grava resultado em sessionStorage e redireciona para Caixas com wizard pré-preenchido.
 */
const MetaOAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [msg, setMsg] = useState('A conectar à Meta…');

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const errDesc = params.get('error_description');
      const code = params.get('code');
      const returnedState = params.get('state');

      if (err) {
        toast.error(errDesc || err || 'OAuth cancelado');
        navigate('/channels', { replace: true });
        return;
      }

      const { state: savedState, orgId } = readAndClearOAuthSession();

      if (!code || !returnedState || !savedState || returnedState !== savedState) {
        toast.error('Estado OAuth inválido. Tente novamente.');
        navigate('/channels', { replace: true });
        return;
      }

      if (!orgId) {
        toast.error('Sessão OAuth incompleta. Abra Novo canal → WhatsApp → Entrar com Meta.');
        navigate('/channels', { replace: true });
        return;
      }

      const redirectUri = getMetaOAuthRedirectUri();
      setMsg('A validar código com o servidor…');

      let payload: {
        waba_id: string;
        phone_number_id: string;
        access_token: string;
        verify_token: string;
        business_name: string | null;
      };
      try {
        payload = await exchangeMetaOAuthCode(code, redirectUri, orgId);
      } catch (e) {
        toast.error((e as Error).message || 'Falha ao obter token Meta');
        navigate('/channels', { replace: true });
        return;
      }

      sessionStorage.setItem(META_OAUTH_RESULT_KEY, JSON.stringify(payload));
      toast.success('Conta Meta ligada. Complete o assistente da caixa WhatsApp.');
      navigate('/channels?meta_oauth=1', { replace: true });
    };

    run().catch(() => {
      toast.error('Erro inesperado');
      navigate('/channels', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <p className="text-muted-foreground">{msg}</p>
    </div>
  );
};

export default MetaOAuthCallbackPage;
