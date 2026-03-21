import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/contexts/OrgContext';
import type { ChannelProvider } from './providerCatalog';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Copy, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMetaAppId, startMetaBusinessOAuth } from '@/lib/metaOAuth';
import {
  getMetaEmbeddedSignupConfigId,
  launchMetaEmbeddedSignup,
} from '@/lib/metaEmbeddedSignup';

type ChannelType = Database['public']['Enums']['channel_type'];

type WizardForm = {
  name: string;
  description: string;
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  welcome_message: string;
  off_hours_message: string;
  sla_policy_name: string;
  team_id: string;
  agent_bot_id: string;
  page_token: string;
  page_id: string;
  app_secret: string;
  bot_token: string;
  imap_host: string;
  imap_user: string;
  smtp_host: string;
  sms_provider: string;
  sms_account_sid: string;
  sms_auth_token: string;
  sms_from: string;
  widget_primary_color: string;
  widget_position: 'bottom-right' | 'bottom-left';
  prechat_name: 'required' | 'optional' | 'hidden';
  prechat_email: 'required' | 'optional' | 'hidden';
  line_channel_secret: string;
};

const emptyForm = (): WizardForm => ({
  name: '',
  description: '',
  waba_id: '',
  phone_number_id: '',
  access_token: '',
  verify_token: '',
  welcome_message: '',
  off_hours_message: '',
  sla_policy_name: '',
  team_id: '',
  agent_bot_id: '',
  page_token: '',
  page_id: '',
  app_secret: '',
  bot_token: '',
  imap_host: '',
  imap_user: '',
  smtp_host: '',
  sms_provider: 'twilio',
  sms_account_sid: '',
  sms_auth_token: '',
  sms_from: '',
  widget_primary_color: '#3B82F6',
  widget_position: 'bottom-right',
  prechat_name: 'optional',
  prechat_email: 'optional',
  line_channel_secret: '',
});

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: ChannelProvider | null;
  /** Preenchimento após OAuth Meta (sessionStorage → ChannelsPage) */
  metaPrefill?: Record<string, string | null> | null;
  onMetaPrefillConsumed?: () => void;
};

type CreatedChannel = {
  id: string;
  public_token: string;
  channel_type: ChannelType;
};

function buildConfig(
  provider: ChannelProvider,
  form: WizardForm,
  baseUrl: string
): Record<string, unknown> {
  const common = {
    description: form.description || undefined,
    welcome_message: form.welcome_message || undefined,
    off_hours_message: form.off_hours_message || undefined,
    sla_policy_name: form.sla_policy_name || undefined,
    team_id: form.team_id || undefined,
  };

  switch (provider.dbType) {
    case 'whatsapp':
      return {
        ...common,
        meta: {
          waba_id: form.waba_id,
          phone_number_id: form.phone_number_id,
          access_token: form.access_token,
          verify_token: form.verify_token,
        },
        webhook_documentation: `${baseUrl}/webhooks/whatsapp/{inbox_id}`,
      };
    case 'messenger':
    case 'instagram':
      return {
        ...common,
        meta: {
          page_token: form.page_token,
          page_id: form.page_id,
          app_secret: form.app_secret,
        },
      };
    case 'telegram':
      return {
        ...common,
        telegram: { bot_token: form.bot_token },
      };
    case 'email':
      return {
        ...common,
        email: {
          imap_host: form.imap_host,
          imap_user: form.imap_user,
          smtp_host: form.smtp_host,
          oauth_note: 'OAuth Google/Microsoft — configurar no backend',
        },
      };
    case 'sms':
      return {
        ...common,
        sms: {
          provider: form.sms_provider,
          account_sid: form.sms_account_sid,
          auth_token: form.sms_auth_token,
          from: form.sms_from,
        },
      };
    case 'livechat':
      return {
        ...common,
        widget: {
          primary_color: form.widget_primary_color,
          position: form.widget_position,
          prechat: {
            name: form.prechat_name,
            email: form.prechat_email,
          },
        },
      };
    case 'api':
      return {
        ...common,
        api: {
          inbound_auth: 'bearer_token',
          callback_url_hint: 'Opcional: URL para eventos outbound',
        },
      };
    case 'line':
      return {
        ...common,
        line: { channel_secret: form.line_channel_secret },
      };
    default:
      return common;
  }
}

const InboxWizard: React.FC<Props> = ({
  open,
  onOpenChange,
  provider,
  metaPrefill,
  onMetaPrefillConsumed,
}) => {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(emptyForm());
  const [created, setCreated] = useState<CreatedChannel | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [metaEmbeddedLoading, setMetaEmbeddedLoading] = useState(false);

  useEffect(() => {
    if (!open || !metaPrefill || provider?.dbType !== 'whatsapp') return;
    setForm((f) => ({
      ...f,
      name:
        f.name.trim() ||
        (typeof metaPrefill.business_name === 'string' && metaPrefill.business_name
          ? metaPrefill.business_name
          : f.name),
      waba_id: metaPrefill.waba_id ?? f.waba_id,
      phone_number_id: metaPrefill.phone_number_id ?? f.phone_number_id,
      access_token: metaPrefill.access_token ?? f.access_token,
      verify_token: metaPrefill.verify_token ?? f.verify_token,
    }));
    onMetaPrefillConsumed?.();
  }, [open, metaPrefill, provider?.dbType, onMetaPrefillConsumed]);

  const baseUrl = useMemo(() => {
    const env = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
    if (env && env.length > 0) return env.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, []);

  const edgeFunctionBase = useMemo(() => {
    const u = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (u && u.length > 0) return `${u.replace(/\/$/, '')}/functions/v1`;
    return '';
  }, []);

  const dbType = provider?.dbType;

  const stepsCount = useMemo(() => {
    if (!dbType) return 1;
    if (dbType === 'api') return 3;
    return 4;
  }, [dbType]);

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('teams')
        .select('id, name')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg && open,
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['agent_bots', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('agent_bots')
        .select('id, name, is_active')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg && open,
  });

  const reset = () => {
    setStep(0);
    setForm(emptyForm());
    setCreated(null);
    setCopied(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !provider?.dbType) throw new Error('Organização ou canal inválido');
      const config = buildConfig(provider, form, baseUrl);
      const { data, error } = await supabase
        .from('channels')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          channel_type: provider.dbType,
          config,
          is_active: true,
        })
        .select('id, public_token, channel_type')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Resposta vazia');

      if (form.agent_bot_id) {
        const { error: linkErr } = await supabase.from('channel_agent_bots').insert({
          channel_id: data.id,
          agent_bot_id: form.agent_bot_id,
          settings: { bot_responds_first: true },
        });
        if (linkErr) throw linkErr;
      }

      return data as CreatedChannel;
    },
    onSuccess: (data) => {
      setCreated(data);
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Caixa de entrada criada');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Erro ao criar canal');
    },
  });

  const canNext = () => {
    if (!provider) return false;
    if (step === 0) return form.name.trim().length >= 2;
    if (step === 1) {
      switch (provider.dbType) {
        case 'whatsapp':
          return (
            form.waba_id.trim() &&
            form.phone_number_id.trim() &&
            form.access_token.trim() &&
            form.verify_token.trim()
          );
        case 'telegram':
          return form.bot_token.trim().length > 10;
        case 'email':
          return form.imap_host.trim() && form.smtp_host.trim();
        case 'sms':
          return form.sms_account_sid.trim() && form.sms_auth_token.trim() && form.sms_from.trim();
        case 'livechat':
          return true;
        case 'api':
          return true;
        case 'messenger':
        case 'instagram':
          return form.page_token.trim() && form.page_id.trim();
        case 'line':
          return form.line_channel_secret.trim().length > 4;
        default:
          return true;
      }
    }
    return true;
  };

  const next = () => {
    if (step < stepsCount - 1) setStep((s) => s + 1);
    else createMutation.mutate();
  };

  const back = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      toast.success('Copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const renderCredentials = () => {
    if (!provider?.dbType) return null;
    switch (provider.dbType) {
      case 'whatsapp':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Credenciais da Meta (WhatsApp Cloud API). O webhook será registrado no painel da Meta
              apontando para a URL exibida após a criação.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !currentOrg ||
                    !getMetaAppId() ||
                    !getMetaEmbeddedSignupConfigId() ||
                    metaEmbeddedLoading
                  }
                  onClick={async () => {
                    if (!currentOrg) return;
                    setMetaEmbeddedLoading(true);
                    try {
                      const result = await launchMetaEmbeddedSignup(currentOrg.id);
                      setForm((f) => ({
                        ...f,
                        name:
                          f.name.trim() ||
                          (result.business_name ? result.business_name : f.name),
                        waba_id: result.waba_id || f.waba_id,
                        phone_number_id: result.phone_number_id || f.phone_number_id,
                        access_token: result.access_token || f.access_token,
                        verify_token: result.verify_token || f.verify_token,
                      }));
                      toast.success('Cadastro incorporado concluído. Revise os campos e avance.');
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setMetaEmbeddedLoading(false);
                    }
                  }}
                >
                  {metaEmbeddedLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      A ligar à Meta…
                    </>
                  ) : (
                    'Cadastro incorporado (Embedded Signup)'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!currentOrg || !getMetaAppId() || metaEmbeddedLoading}
                  onClick={() => {
                    if (!currentOrg) return;
                    try {
                      startMetaBusinessOAuth(currentOrg.id);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  OAuth em nova página
                </Button>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Embedded Signup usa o SDK da Meta e o{' '}
                <code className="text-[10px]">config_id</code> do Facebook Login for Business.
                Domínio deve estar em &quot;Allowed domains&quot; e OAuth activado no painel da app.
              </p>
              {!getMetaAppId() && (
                <span className="text-xs text-destructive">
                  Defina VITE_META_APP_ID no .env.
                </span>
              )}
              {getMetaAppId() && !getMetaEmbeddedSignupConfigId() && (
                <span className="text-xs text-muted-foreground">
                  Para o botão Embedded Signup: crie uma configuração em Facebook Login for Business
                  (template WhatsApp Embedded Signup) e defina VITE_META_EMBEDDED_SIGNUP_CONFIG_ID.
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>WABA ID</Label>
                <Input
                  value={form.waba_id}
                  onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                  placeholder="WhatsApp Business Account ID"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  value={form.phone_number_id}
                  onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Access Token (System User)</Label>
              <Input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Verify Token (webhook)</Label>
              <Input
                value={form.verify_token}
                onChange={(e) => setForm({ ...form, verify_token: e.target.value })}
                placeholder="Token que você configurará no Meta App"
              />
            </div>
          </div>
        );
      case 'messenger':
      case 'instagram':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OAuth com Facebook será integrado no backend. Por ora, informe manualmente os tokens
              da página.
            </p>
            <div className="space-y-2">
              <Label>Page ID</Label>
              <Input value={form.page_id} onChange={(e) => setForm({ ...form, page_id: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Page Access Token</Label>
              <Input
                type="password"
                value={form.page_token}
                onChange={(e) => setForm({ ...form, page_token: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>App Secret</Label>
              <Input
                type="password"
                value={form.app_secret}
                onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
              />
            </div>
          </div>
        );
      case 'telegram':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Token obtido com o @BotFather. A plataforma registrará o webhook via setWebhook.
            </p>
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input
                type="password"
                value={form.bot_token}
                onChange={(e) => setForm({ ...form, bot_token: e.target.value })}
                placeholder="123456:ABC..."
              />
            </div>
          </div>
        );
      case 'email':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configuração IMAP/SMTP. OAuth Google/Microsoft fica no serviço de backend.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Servidor IMAP</Label>
                <Input
                  value={form.imap_host}
                  onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                  placeholder="imap.gmail.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Usuário IMAP</Label>
                <Input
                  value={form.imap_user}
                  onChange={(e) => setForm({ ...form, imap_user: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Servidor SMTP (envio)</Label>
              <Input
                value={form.smtp_host}
                onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>
          </div>
        );
      case 'sms':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Select
                value={form.sms_provider}
                onValueChange={(v) => setForm({ ...form, sms_provider: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="zenvia">Zenvia</SelectItem>
                  <SelectItem value="vonage">Vonage</SelectItem>
                  <SelectItem value="infobip">Infobip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account SID / equivalente</Label>
              <Input
                value={form.sms_account_sid}
                onChange={(e) => setForm({ ...form, sms_account_sid: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Auth Token</Label>
              <Input
                type="password"
                value={form.sms_auth_token}
                onChange={(e) => setForm({ ...form, sms_auth_token: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Número remetente</Label>
              <Input
                value={form.sms_from}
                onChange={(e) => setForm({ ...form, sms_from: e.target.value })}
                placeholder="+5511999990000"
              />
            </div>
          </div>
        );
      case 'livechat':
        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cor primária</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    className="h-10 w-14 p-1 cursor-pointer"
                    value={form.widget_primary_color}
                    onChange={(e) => setForm({ ...form, widget_primary_color: e.target.value })}
                  />
                  <Input
                    value={form.widget_primary_color}
                    onChange={(e) => setForm({ ...form, widget_primary_color: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Posição do launcher</Label>
                <Select
                  value={form.widget_position}
                  onValueChange={(v) =>
                    setForm({ ...form, widget_position: v as WizardForm['widget_position'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Inferior direito</SelectItem>
                    <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pré-chat — Nome</Label>
                <Select
                  value={form.prechat_name}
                  onValueChange={(v) =>
                    setForm({ ...form, prechat_name: v as WizardForm['prechat_name'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Obrigatório</SelectItem>
                    <SelectItem value="optional">Opcional</SelectItem>
                    <SelectItem value="hidden">Oculto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pré-chat — E-mail</Label>
                <Select
                  value={form.prechat_email}
                  onValueChange={(v) =>
                    setForm({ ...form, prechat_email: v as WizardForm['prechat_email'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Obrigatório</SelectItem>
                    <SelectItem value="optional">Opcional</SelectItem>
                    <SelectItem value="hidden">Oculto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      case 'api':
        return (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Não são necessárias credenciais adicionais nesta etapa. Após criar, você receberá o token
            público da inbox e exemplos de payload para integração.
          </div>
        );
      case 'line':
        return (
          <div className="space-y-2">
            <Label>Channel secret</Label>
            <Input
              type="password"
              value={form.line_channel_secret}
              onChange={(e) => setForm({ ...form, line_channel_secret: e.target.value })}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderBehavior = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Mensagem de boas-vindas</Label>
        <Textarea
          value={form.welcome_message}
          onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
          rows={2}
          placeholder="Enviada ao iniciar conversa (quando suportado pelo canal)"
        />
      </div>
      <div className="space-y-2">
        <Label>Mensagem fora do horário</Label>
        <Textarea
          value={form.off_hours_message}
          onChange={(e) => setForm({ ...form, off_hours_message: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Nome da política de SLA (referência)</Label>
        <Input
          value={form.sla_policy_name}
          onChange={(e) => setForm({ ...form, sla_policy_name: e.target.value })}
          placeholder="Ex.: Suporte Padrão"
        />
      </div>
      <div className="space-y-2">
        <Label>Time responsável (opcional)</Label>
        <Select
          value={form.team_id || '__none__'}
          onValueChange={(v) => setForm({ ...form, team_id: v === '__none__' ? '' : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhum</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Agent Bot (opcional)</Label>
        <Select
          value={form.agent_bot_id || '__none__'}
          onValueChange={(v) => setForm({ ...form, agent_bot_id: v === '__none__' ? '' : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhum</SelectItem>
            {bots.filter((b) => b.is_active).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Bots são configurados em Configurações → Agent Bots. Conversas podem iniciar em pending
          quando o bot estiver ativo.
        </p>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border p-3 space-y-1">
        <p>
          <span className="text-muted-foreground">Nome:</span> {form.name}
        </p>
        {form.description && (
          <p>
            <span className="text-muted-foreground">Descrição:</span> {form.description}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Canal:</span> {provider?.name}
        </p>
      </div>
      <p className="text-muted-foreground">
        Revise os dados e clique em &quot;Criar caixa&quot; para provisionar a inbox e obter URLs de
        webhook e tokens.
      </p>
    </div>
  );

  const renderSuccess = () => {
    if (!created || !provider) return null;
    const inbound = `${baseUrl}/webhooks/inbound/${created.public_token}`;
    const waHook = edgeFunctionBase
      ? `${edgeFunctionBase}/meta-whatsapp-webhook?channel_id=${created.id}`
      : `${baseUrl}/webhooks/whatsapp/${created.id}`;
    const tgSetUrl = edgeFunctionBase ? `${edgeFunctionBase}/telegram-set-webhook` : '';
    const widgetSnippet = `<script src="${baseUrl}/widget.js" data-inbox-token="${created.public_token}"></script>`;

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Guarde estes valores em local seguro. Tokens de API não serão exibidos novamente em tela
          cheia — use Configurações para rotacionar.
        </p>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">ID da caixa</Label>
          <div className="flex gap-2">
            <Input readOnly value={created.id} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copyText('id', created.id)}
            >
              {copied === 'id' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Token público (widget / API)</Label>
          <div className="flex gap-2">
            <Input readOnly value={created.public_token} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copyText('pt', created.public_token)}
            >
              {copied === 'pt' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {created.channel_type === 'whatsapp' && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Callback URL Meta (Edge Function meta-whatsapp-webhook)
            </Label>
            {edgeFunctionBase && (
              <p className="text-[11px] text-muted-foreground">
                Cole no Meta App → WhatsApp → Configuration. O Verify Token é o configurado em
                config.meta.verify_token.
              </p>
            )}
            <div className="flex gap-2">
              <Input readOnly value={waHook} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyText('wa', waHook)}
              >
                {copied === 'wa' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
        {created.channel_type === 'telegram' && tgSetUrl && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">Telegram — setWebhook</Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Faça POST para <code className="text-xs">{tgSetUrl}</code> com header{' '}
              <code className="text-xs">Authorization: Bearer INTERNAL_HOOK_SECRET</code> e corpo{' '}
              <code className="text-xs break-all">{`{"channel_id":"${created.id}"}`}</code>
            </p>
          </div>
        )}
        {(created.channel_type === 'api' || created.channel_type === 'livechat') && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {created.channel_type === 'livechat' ? 'Script do widget' : 'Webhook inbound genérico'}
            </Label>
            <div className="flex gap-2">
              <Textarea readOnly value={created.channel_type === 'livechat' ? widgetSnippet : inbound} rows={3} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() =>
                  copyText(
                    'in',
                    created.channel_type === 'livechat' ? widgetSnippet : inbound
                  )
                }
              >
                {copied === 'in' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const stepTitle = () => {
    if (created) return 'Caixa criada';
    if (!provider) return '';
    if (step === 0) return 'Informações básicas';
    if (dbType === 'api' && step === 1) return 'Comportamento e automação';
    if (step === 1) return 'Credenciais do canal';
    if (step === 2) return 'Mensagens, SLA e robô';
    return 'Revisão';
  };

  const renderStepBody = () => {
    if (created) return renderSuccess();
    if (!provider) return null;
    if (step === 0) {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da caixa</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: WhatsApp Suporte"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      );
    }
    if (dbType === 'api') {
      if (step === 1) return renderBehavior();
      if (step === 2) return renderReview();
    }
    if (step === 1) return renderCredentials();
    if (step === 2) return renderBehavior();
    return renderReview();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {provider?.name ?? 'Nova caixa'}
          </DialogTitle>
          <DialogDescription>{stepTitle()}</DialogDescription>
        </DialogHeader>

        {!created && provider && (
          <div className="flex gap-1 mb-2">
            {Array.from({ length: stepsCount }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= step ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
        )}

        {renderStepBody()}

        <div className="flex justify-between gap-2 pt-2">
          {!created ? (
            <>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <div className="flex gap-2">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={back}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={next}
                  disabled={!canNext() || createMutation.isPending}
                >
                  {step < stepsCount - 1 ? (
                    <>
                      Avançar
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    'Criar caixa'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" className="w-full" onClick={() => handleClose(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InboxWizard;
