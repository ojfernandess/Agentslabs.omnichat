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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import type { Database, Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Copy, Check, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMetaAppId, startMetaBusinessOAuth } from '@/lib/metaOAuth';
import { getFunctionsBaseUrl } from '@/lib/runtimeEnv';

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
  /** WhatsApp: Meta Cloud API vs Evolution API (Baileys) */
  whatsapp_provider: 'meta' | 'evolution';
  evolution_base_url: string;
  evolution_api_key: string;
  evolution_instance_name: string;
  evolution_webhook_secret: string;
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
  whatsapp_provider: 'meta',
  evolution_base_url: '',
  evolution_api_key: '',
  evolution_instance_name: '',
  evolution_webhook_secret: '',
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
      if (form.whatsapp_provider === 'evolution') {
        return {
          ...common,
          whatsapp_provider: 'evolution',
          evolution: {
            base_url: form.evolution_base_url.replace(/\/$/, ''),
            api_key: form.evolution_api_key,
            instance_name: form.evolution_instance_name.trim(),
            webhook_secret: form.evolution_webhook_secret.trim() || undefined,
          },
        };
      }
      return {
        ...common,
        whatsapp_provider: 'meta',
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
  /** WhatsApp: mostrar campos WABA/token só após pedir configuração manual (fluxo tipo Chatwoot). */
  const [whatsappManualConfig, setWhatsappManualConfig] = useState(false);

  useEffect(() => {
    if (!open || !metaPrefill || provider?.dbType !== 'whatsapp') return;
    if (form.whatsapp_provider !== 'meta') return;
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
  }, [open, metaPrefill, provider?.dbType, onMetaPrefillConsumed, form.whatsapp_provider]);

  const baseUrl = useMemo(() => {
    const env = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
    if (env && env.length > 0) return env.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, []);

  const edgeFunctionBase = useMemo(() => {
    try {
      return getFunctionsBaseUrl();
    } catch {
      return '';
    }
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
    setWhatsappManualConfig(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !provider?.dbType) throw new Error('Organização ou canal inválido');
      const config = buildConfig(provider, form, baseUrl) as Json;
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
          settings: { bot_responds_first: true } as Json,
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
          if (form.whatsapp_provider === 'evolution') {
            return (
              form.evolution_base_url.trim().length > 0 &&
              form.evolution_api_key.trim().length > 0 &&
              form.evolution_instance_name.trim().length > 0
            );
          }
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
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipo de integração WhatsApp</Label>
              <RadioGroup
                value={form.whatsapp_provider}
                onValueChange={(v) =>
                  setForm({ ...form, whatsapp_provider: v as WizardForm['whatsapp_provider'] })
                }
                className="grid gap-3 sm:grid-cols-2"
              >
                <label
                  htmlFor="wp-meta"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value="meta" id="wp-meta" className="mt-1" />
                  <div>
                    <span className="font-medium">Meta Cloud API</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      WhatsApp Business oficial (Graph API, OAuth Meta).
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="wp-evo"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value="evolution" id="wp-evo" className="mt-1" />
                  <div>
                    <span className="font-medium">Evolution API</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Instância própria (Baileys) — REST + webhooks.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {form.whatsapp_provider === 'meta' && (
              <>
                <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex flex-col gap-4 p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]">
                        <Phone className="h-6 w-6" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-lg font-semibold leading-tight">
                          Configuração rápida com Meta
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          Utilize o fluxo de inscrição com a Meta para ligar os seus números. Será
                          redirecionado para iniciar sessão na conta WhatsApp Business — recomendamos
                          acesso de administrador.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2.5 text-sm">
                      {[
                        'Sem configuração manual obrigatória quando concluir o OAuth com sucesso.',
                        'Autenticação OAuth segura com a Meta.',
                        'Após a ligação, configure webhooks e números no painel (instruções após criar a caixa).',
                      ].map((line) => (
                        <li key={line} className="flex gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" aria-hidden />
                          <span className="text-muted-foreground">{line}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-3 pt-1">
                      <Button
                        type="button"
                        size="lg"
                        className="h-12 w-full border-0 bg-[#25D366] px-8 text-base font-medium text-white shadow-sm hover:bg-[#20BD5A] sm:w-auto"
                        disabled={!currentOrg || !getMetaAppId()}
                        onClick={() => {
                          if (!currentOrg) return;
                          try {
                            startMetaBusinessOAuth(currentOrg.id);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        Conecte-se com WhatsApp Business
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Registe{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                          {baseUrl}/integrations/meta/callback
                        </code>{' '}
                        no Meta App (Facebook Login OAuth) e o domínio em &quot;Allowed domains&quot;.
                        Para o fluxo oficial WhatsApp Embedded Signup (como Chatwoot), crie em Facebook
                        Login for Business → Configurations a variante &quot;WhatsApp Embedded Signup&quot; e
                        defina <code className="rounded bg-muted px-1 text-[10px]">VITE_META_EMBEDDED_CONFIG_ID</code>{' '}
                        no build (.env / Easypanel / secret GitHub Actions).
                      </p>
                      {!getMetaAppId() && (
                        <p className="text-xs text-destructive">Defina META_APP_ID no .env.</p>
                      )}
                      <button
                        type="button"
                        className="w-fit text-left text-sm text-primary underline-offset-4 hover:underline"
                        onClick={() => setWhatsappManualConfig((v) => !v)}
                      >
                        {whatsappManualConfig
                          ? 'Ocultar configuração manual'
                          : 'Use o fluxo de configuração manual se o número já está na API ou é um parceiro técnico.'}
                      </button>
                    </div>
                  </div>
                </div>

                {whatsappManualConfig && (
                  <div className="space-y-4 rounded-lg border border-dashed bg-muted/20 p-4">
                    <p className="text-sm font-medium">Credenciais manuais (WhatsApp Cloud API)</p>
                    <p className="text-xs text-muted-foreground">
                      Preencha os campos abaixo se não utilizar OAuth. O webhook será configurado na Meta
                      com a URL indicada após criar a caixa.
                    </p>
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
                )}
              </>
            )}

            {form.whatsapp_provider === 'evolution' && (
              <div className="space-y-4 rounded-xl border bg-muted/20 p-6">
                <div>
                  <h3 className="text-lg font-semibold">Evolution API v2</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Servidor Evolution (Docker ou cloud). Referência:{' '}
                    <a
                      href="https://doc.evolution-api.com/v2/en/get-started/introduction"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      doc.evolution-api.com
                    </a>
                    . Envio:{' '}
                    <code className="text-xs">POST /message/sendText/&#123;instance&#125;</code> com header{' '}
                    <code className="text-xs">apikey</code>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>URL base da API</Label>
                  <Input
                    type="url"
                    placeholder="https://sua-evolution.com"
                    value={form.evolution_base_url}
                    onChange={(e) => setForm({ ...form, evolution_base_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={form.evolution_api_key}
                    onChange={(e) => setForm({ ...form, evolution_api_key: e.target.value })}
                    autoComplete="off"
                    placeholder="Header apikey na Evolution"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome da instância</Label>
                  <Input
                    value={form.evolution_instance_name}
                    onChange={(e) => setForm({ ...form, evolution_instance_name: e.target.value })}
                    placeholder="ex.: loja-suporte"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secret do webhook (opcional)</Label>
                  <Input
                    type="password"
                    value={form.evolution_webhook_secret}
                    onChange={(e) => setForm({ ...form, evolution_webhook_secret: e.target.value })}
                    placeholder="Se preencher, use ?secret=... na URL do webhook"
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Depois de criar a caixa, copie a URL do webhook e registe na Evolution com{' '}
                  <code className="rounded bg-muted px-1 text-[10px]">POST /webhook/set/&#123;instance&#125;</code>{' '}
                  e eventos <code className="text-[10px]">MESSAGES_UPSERT</code> (e opcionalmente{' '}
                  <code className="text-[10px]">CONNECTION_UPDATE</code>).
                </p>
              </div>
            )}
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
    const apiUrl = edgeFunctionBase;
    const widgetSnippet = apiUrl
      ? `<script src="${baseUrl}/widget.js" data-inbox-token="${created.public_token}" data-api-url="${apiUrl}" defer></script>`
      : `<script src="${baseUrl}/widget.js" data-inbox-token="${created.public_token}"></script>`;

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
              {form.whatsapp_provider === 'evolution'
                ? 'URL do webhook (Evolution API → POST /webhook/set/{instance})'
                : 'Callback URL Meta (Edge Function meta-whatsapp-webhook)'}
            </Label>
            {edgeFunctionBase && form.whatsapp_provider === 'meta' && (
              <p className="text-[11px] text-muted-foreground">
                Cole no Meta App → WhatsApp → Configuration. O Verify Token é o configurado em
                config.meta.verify_token.
              </p>
            )}
            {edgeFunctionBase && form.whatsapp_provider === 'evolution' && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Na Evolution, registe esta URL com eventos{' '}
                <code className="text-[10px]">MESSAGES_UPSERT</code> (e opcionalmente{' '}
                <code className="text-[10px]">CONNECTION_UPDATE</code>). Body exemplo:{' '}
                <code className="text-[10px]">
                  {`{"enabled":true,"url":"…","webhookByEvents":false,"webhookBase64":false,"events":["MESSAGES_UPSERT"]}`}
                </code>
              </p>
            )}
            <div className="flex gap-2">
              <Input
                readOnly
                value={
                  form.whatsapp_provider === 'evolution' && edgeFunctionBase
                    ? `${edgeFunctionBase}/evolution-whatsapp-webhook?channel_id=${created.id}${
                        form.evolution_webhook_secret.trim()
                          ? `&secret=${encodeURIComponent(form.evolution_webhook_secret.trim())}`
                          : ''
                      }`
                    : waHook
                }
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  copyText(
                    'wa',
                    form.whatsapp_provider === 'evolution' && edgeFunctionBase
                      ? `${edgeFunctionBase}/evolution-whatsapp-webhook?channel_id=${created.id}${
                          form.evolution_webhook_secret.trim()
                            ? `&secret=${encodeURIComponent(form.evolution_webhook_secret.trim())}`
                            : ''
                        }`
                      : waHook
                  )
                }
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
    if (provider.dbType === 'whatsapp') {
      if (step === 0) return 'Informações da caixa';
      if (step === 1) return 'Configuração rápida com Meta';
      if (step === 2) return 'Mensagens, equipa e SLA';
      return 'Rever e criar';
    }
    if (step === 0) return 'Informações básicas';
    if (dbType === 'api' && step === 1) return 'Comportamento e automação';
    if (step === 1) return 'Credenciais do canal';
    if (step === 2) return 'Mensagens, SLA e robô';
    return 'Revisão';
  };

  const isWhatsappWizard = provider?.dbType === 'whatsapp' && !created;

  const whatsappSidebarSteps = [
    { title: 'Escolha o Canal', subtitle: 'WhatsApp selecionado' },
    { title: 'Criar Caixa de Entrada', subtitle: 'Autentique a conta e crie a inbox' },
    { title: 'Adicionar Agentes', subtitle: 'Equipa e robô opcional' },
    { title: 'Então!', subtitle: 'Rever e criar a caixa' },
  ] as const;

  const whatsappStepDone = (i: number) =>
    i === 0 ? true : i === 1 ? step >= 2 : i === 2 ? step >= 3 : false;

  const whatsappStepCurrent = (i: number) =>
    i === 0
      ? false
      : i === 1
        ? step <= 1
        : i === 2
          ? step === 2
          : step === 3;

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

  const footerNav = (
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
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden',
          isWhatsappWizard ? 'max-w-4xl' : 'max-w-lg overflow-y-auto'
        )}
      >
        {isWhatsappWizard ? (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <aside className="w-full shrink-0 border-b bg-muted/25 sm:w-56 sm:border-b-0 sm:border-r sm:bg-muted/15">
              <nav className="flex gap-2 overflow-x-auto p-4 sm:flex-col sm:gap-0 sm:p-5">
                <p className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:mb-4 sm:block">
                  Assistente
                </p>
                <ol className="flex min-w-0 gap-3 sm:flex-col sm:gap-5">
                  {whatsappSidebarSteps.map((s, i) => {
                    const done = whatsappStepDone(i);
                    const current = whatsappStepCurrent(i);
                    return (
                      <li key={s.title} className="flex min-w-[140px] gap-3 sm:min-w-0">
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            done && 'bg-primary text-primary-foreground',
                            !done && current && 'border-2 border-primary bg-background text-primary',
                            !done && !current && 'border border-muted-foreground/25 text-muted-foreground'
                          )}
                          aria-current={current ? 'step' : undefined}
                        >
                          {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <p
                            className={cn(
                              'text-sm font-medium leading-tight',
                              current && 'text-foreground',
                              !current && 'text-muted-foreground'
                            )}
                          >
                            {s.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{s.subtitle}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </aside>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <DialogHeader className="space-y-1.5 pb-4 text-left">
                  <DialogTitle className="text-xl">{provider?.name ?? 'WhatsApp'}</DialogTitle>
                  <DialogDescription>{stepTitle()}</DialogDescription>
                </DialogHeader>
                {renderStepBody()}
              </div>
              <div className="shrink-0 border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {footerNav}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex max-h-[90vh] flex-col overflow-y-auto p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {provider?.name ?? 'Nova caixa'}
                </DialogTitle>
                <DialogDescription>{stepTitle()}</DialogDescription>
              </DialogHeader>

              {!created && provider && (
                <div className="mb-2 flex gap-1">
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
              {footerNav}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InboxWizard;
