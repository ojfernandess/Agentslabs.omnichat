import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Hash,
  Users,
  Clock,
  Star,
  Settings,
  Bot,
  Heart,
  Check,
  ChevronRight,
  Layout,
  Copy,
  FileText,
  GripVertical,
  Upload,
  Stethoscope,
} from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_CSAT_MESSAGE } from '@/lib/csatSettings';
import { uploadInboxAvatar } from '@/lib/messageAttachmentUpload';
import { cn } from '@/lib/utils';
import { getFunctionsBaseUrl } from '@/lib/runtimeEnv';
import { invokeEdgeFunctionFormData, invokeEdgeFunctionJson } from '@/lib/invokeEdgeFunctionJson';

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  telegram: 'Telegram',
  email: 'E-mail',
  livechat: 'Live Chat',
  sms: 'SMS',
  api: 'API',
  line: 'LINE',
};

const DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

type WorkingHourDay = {
  day_of_week: number;
  open_all_day: boolean;
  closed_all_day: boolean;
  open_hour: number;
  open_minutes: number;
  close_hour: number;
  close_minutes: number;
};

type PrechatField = {
  key: string;
  type: 'text' | 'email' | 'number';
  required: boolean;
  label: string;
  placeholder: string;
  enabled: boolean;
};

const PRECHAT_STANDARD_FIELDS: PrechatField[] = [
  { key: 'emailAddress', type: 'email', required: true, label: 'E-mail', placeholder: 'Endereço de e-mail', enabled: true },
  { key: 'fullName', type: 'text', required: true, label: 'Nome', placeholder: 'Seu nome', enabled: true },
  { key: 'phoneNumber', type: 'text', required: false, label: 'Telefone', placeholder: '11 - 99999-9999', enabled: true },
];

const defaultWorkingDay = (): WorkingHourDay => ({
  day_of_week: 0,
  open_all_day: true,
  closed_all_day: false,
  open_hour: 9,
  open_minutes: 0,
  close_hour: 18,
  close_minutes: 0,
});

const BASE_TABS = [
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'agents', label: 'Agentes', icon: Users },
  { id: 'hours', label: 'Horário de funcionamento', icon: Clock },
  { id: 'csat', label: 'CSAT', icon: Star },
  { id: 'prechat', label: 'Formulário Chat Pré', icon: FileText, livechatOnly: true },
  { id: 'widget', label: 'Construtor de Widget', icon: Layout, livechatOnly: true },
  { id: 'config', label: 'Configuração avançada', icon: Settings },
  { id: 'bot', label: 'Configuração do Bot', icon: Bot },
  { id: 'health', label: 'Saúde da conta', icon: Heart },
] as const;

const SectionCard = ({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="rounded-xl border bg-card p-6 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

const InboxSettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('settings');
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel', id, currentOrg?.id],
    queryFn: async () => {
      if (!id || !currentOrg) return null;
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('id', id)
        .eq('organization_id', currentOrg.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!currentOrg,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const { data: helpCategories = [] } = useQuery({
    queryKey: ['help-categories', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('help_center_categories')
        .select('id, name')
        .eq('organization_id', currentOrg.id)
        .order('sort_order');
      return data ?? [];
    },
    enabled: !!currentOrg && !!channel,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('id, display_name, role, status')
        .eq('organization_id', currentOrg.id)
        .order('created_at');
      return data ?? [];
    },
    enabled: !!currentOrg && !!channel && activeTab === 'agents',
  });

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from('channel_members')
        .select('organization_member_id')
        .eq('channel_id', id);
      return (data ?? []).map((r) => r.organization_member_id);
    },
    enabled: !!id && !!channel && activeTab === 'agents',
  });

  const { data: agentBots = [] } = useQuery({
    queryKey: ['agent_bots', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('agent_bots')
        .select('id, name, is_active')
        .eq('organization_id', currentOrg.id);
      return data ?? [];
    },
    enabled: !!currentOrg && !!channel && activeTab === 'bot',
  });

  const { data: linkedBot } = useQuery({
    queryKey: ['channel-agent-bot', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase
        .from('channel_agent_bots')
        .select('agent_bot_id')
        .eq('channel_id', id)
        .maybeSingle();
      return data?.agent_bot_id ?? null;
    },
    enabled: !!id && !!channel && activeTab === 'bot',
  });

  const formInitRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    avatar_url: '' as string,
    greeting_enabled: false,
    welcome_message: '',
    help_center_category_id: '' as string,
    lock_to_single_conversation: false,
    is_active: true,
  });

  const [advancedForm, setAdvancedForm] = useState({
    allow_messages_after_resolved: true,
    timezone: 'America/Sao_Paulo',
  });

  const [workingHoursForm, setWorkingHoursForm] = useState({
    enabled: false,
    out_of_office_message: '',
    working_hours: DAYS.map((d) => ({ ...defaultWorkingDay(), day_of_week: d.value })),
  });

  const [mediaDiagLoading, setMediaDiagLoading] = useState(false);
  const [mediaDiagResult, setMediaDiagResult] = useState<Record<string, unknown> | null>(null);
  const mediaDiagFileInputRef = useRef<HTMLInputElement>(null);

  const [csatForm, setCsatForm] = useState({
    enabled: false,
    message: DEFAULT_CSAT_MESSAGE,
  });

  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [widgetScriptCopied, setWidgetScriptCopied] = useState(false);

  const [widgetForm, setWidgetForm] = useState({
    site_name: '',
    welcome_title: '',
    welcome_description: '',
    response_time: 'few_minutes' as 'few_minutes' | 'few_hours' | 'same_day' | 'next_day',
    widget_color: '#7C3AED',
    position: 'right' as 'right' | 'left',
    type: 'standard' as 'standard' | 'expanded_bubble',
    launcher_title: 'Fale conosco no chat',
    avatar_url: '' as string,
    available_message: 'Estamos On-line',
    unavailable_message: 'Estamos offline. Deixe uma mensagem.',
  });

  const [prechatForm, setPrechatForm] = useState({
    enabled: false,
    message: 'Preencha as informações abaixo, para iniciar seu atendimento.',
    fields: [...PRECHAT_STANDARD_FIELDS],
  });

  useEffect(() => {
    if (!channel?.id) return;
    if (formInitRef.current === channel.id) return;
    formInitRef.current = channel.id;
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    const widget = (cfg.widget ?? {}) as Record<string, unknown>;
    const avatarUrl = (widget.avatar_url as string) ?? (cfg.avatar_url as string) ?? '';
    setForm({
      name: channel.name ?? '',
      avatar_url: avatarUrl,
      greeting_enabled: !!cfg.welcome_message,
      welcome_message: (cfg.welcome_message as string) ?? '',
      help_center_category_id: (cfg.help_center_category_id as string) ?? '',
      lock_to_single_conversation: !!(cfg.lock_to_single_conversation as boolean),
      is_active: channel.is_active !== false,
    });
    setAdvancedForm({
      allow_messages_after_resolved: (cfg.allow_messages_after_resolved as boolean) !== false,
      timezone: (cfg.timezone as string) || 'America/Sao_Paulo',
    });
    const wh = (cfg.working_hours as Record<string, unknown>) ?? {};
    const whArr = (wh.schedule as WorkingHourDay[]) ?? DAYS.map((d) => ({ ...defaultWorkingDay(), day_of_week: d.value }));
    setWorkingHoursForm({
      enabled: !!(cfg.working_hours_enabled as boolean),
      out_of_office_message: (cfg.out_of_office_message as string) ?? '',
      working_hours: Array.isArray(whArr) && whArr.length >= 7
        ? whArr
        : DAYS.map((d) => ({ ...defaultWorkingDay(), day_of_week: d.value })),
    });
    const csat = (cfg.csat ?? {}) as Record<string, unknown>;
    setCsatForm({
      enabled: !!(csat.enabled as boolean),
      message: (csat.message as string) || DEFAULT_CSAT_MESSAGE,
    });
  }, [channel?.id]);

  useEffect(() => {
    formInitRef.current = null;
  }, [id]);

  useEffect(() => {
    if (linkedBot !== undefined) setSelectedBotId(linkedBot);
  }, [linkedBot]);

  useEffect(() => {
    if (!channel || channel.channel_type !== 'livechat') return;
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    const widget = (cfg.widget ?? {}) as Record<string, unknown>;
    const pos = widget.position as string;
    const isLeft = pos === 'left' || pos === 'bottom-left';
    const wType = widget.type as string;
    const widgetType = wType === 'expanded_bubble' ? 'expanded_bubble' : 'standard';
    setWidgetForm({
      site_name: (widget.site_name as string) ?? channel.name ?? '',
      welcome_title: (widget.welcome_title as string) ?? (widget.welcome_headline as string) ?? 'Olá, tudo bem?',
      welcome_description:
        (widget.welcome_description as string) ??
        (widget.welcome_message as string) ??
        (cfg.welcome_message as string) ??
        'Sou o assistente virtual e posso ajudar com informações, dúvidas ou direcionar você para um atendente. Como posso ajudar?',
      response_time: (widget.response_time as 'few_minutes' | 'few_hours' | 'same_day' | 'next_day') ?? 'few_minutes',
      widget_color: (widget.widget_color as string) ?? (widget.primary_color as string) ?? '#7C3AED',
      position: isLeft ? 'left' : 'right',
      type: widgetType,
      launcher_title: (widget.launcher_title as string) ?? (widget.launcherTitle as string) ?? 'Fale conosco no chat',
      avatar_url: (widget.avatar_url as string) ?? '',
      available_message: (widget.available_message as string) ?? (widget.availableMessage as string) ?? 'Estamos On-line',
      unavailable_message:
        (widget.unavailable_message as string) ?? (widget.unavailableMessage as string) ?? 'Estamos offline. Deixe uma mensagem.',
    });
  }, [channel?.id]);

  useEffect(() => {
    if (!channel || channel.channel_type !== 'livechat') return;
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    const widget = (cfg.widget ?? {}) as Record<string, unknown>;
    const prechat = (widget.prechat ?? {}) as Record<string, unknown>;
    const storedFields = (prechat.fields ?? []) as PrechatField[];
    const fields =
      storedFields.length > 0
        ? storedFields.map((f) => ({
            key: (f as PrechatField).key ?? '',
            type: ((f as PrechatField).type ?? 'text') as 'text' | 'email' | 'number',
            required: !!(f as PrechatField).required,
            label: ((f as PrechatField).label as string) ?? (f as PrechatField).key ?? '',
            placeholder: ((f as PrechatField).placeholder as string) ?? '',
            enabled: (f as PrechatField).enabled !== false,
          }))
        : [...PRECHAT_STANDARD_FIELDS];
    setPrechatForm({
      enabled: !!(prechat.enabled as boolean),
      message: (prechat.message as string) ?? 'Preencha as informações abaixo, para iniciar seu atendimento.',
      fields,
    });
  }, [channel?.id]);

  const updateChannel = useMutation({
    mutationFn: async (payload: {
      name?: string;
      is_active?: boolean;
      config: Record<string, unknown>;
    }) => {
      if (!channel?.id) return;
      const { error } = await supabase
        .from('channels')
        .update({
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.is_active !== undefined && { is_active: payload.is_active }),
          config: payload.config,
        })
        .eq('id', channel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel', id] });
      queryClient.invalidateQueries({ queryKey: ['channels', currentOrg?.id] });
      toast.success('Caixa atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getBaseConfig = () => ((channel?.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;

  const saveSettings = () => {
    if (!channel?.id) return;
    const cfg = getBaseConfig();
    const widget = (cfg.widget ?? {}) as Record<string, unknown>;
    const mergedConfig: Record<string, unknown> = {
      ...cfg,
      welcome_message: form.greeting_enabled ? form.welcome_message || undefined : undefined,
      help_center_category_id: form.help_center_category_id || undefined,
      lock_to_single_conversation: form.lock_to_single_conversation,
    };
    if (channel.channel_type === 'livechat') {
      mergedConfig.widget = { ...widget, avatar_url: form.avatar_url || undefined };
    } else {
      mergedConfig.avatar_url = form.avatar_url || undefined;
    }
    updateChannel.mutate(
      {
        name: form.name.trim(),
        is_active: form.is_active,
        config: mergedConfig,
      },
      {
        onSuccess: () => {
          if (channel.channel_type === 'livechat') {
            setWidgetForm((prev) => ({ ...prev, avatar_url: form.avatar_url }));
          }
        },
      }
    );
  };

  const saveAdvanced = () => {
    if (!channel?.id) return;
    const cfg = getBaseConfig();
    updateChannel.mutate({
      config: {
        ...cfg,
        allow_messages_after_resolved: advancedForm.allow_messages_after_resolved,
        timezone: advancedForm.timezone,
      },
    });
  };

  const saveWorkingHours = () => {
    if (!channel?.id) return;
    const cfg = getBaseConfig();
    updateChannel.mutate({
      config: {
        ...cfg,
        working_hours_enabled: workingHoursForm.enabled,
        out_of_office_message: workingHoursForm.out_of_office_message,
        working_hours: { schedule: workingHoursForm.working_hours },
      },
    });
  };

  const saveCsat = () => {
    if (!channel?.id) return;
    const cfg = getBaseConfig();
    updateChannel.mutate({
      config: {
        ...cfg,
        csat: { enabled: csatForm.enabled, message: csatForm.message },
      },
    });
  };

  const savePrechat = () => {
    if (!channel?.id || channel.channel_type !== 'livechat') return;
    const cfg = getBaseConfig();
    const existingWidget = (cfg.widget ?? {}) as Record<string, unknown>;
    updateChannel.mutate({
      config: {
        ...cfg,
        widget: {
          ...existingWidget,
          prechat: {
            enabled: prechatForm.enabled,
            message: prechatForm.message,
            fields: prechatForm.fields,
          },
        },
      },
    });
  };

  const updatePrechatField = (index: number, updates: Partial<PrechatField>) => {
    const next = [...prechatForm.fields];
    next[index] = { ...next[index], ...updates };
    setPrechatForm({ ...prechatForm, fields: next });
  };

  const saveWidget = () => {
    if (!channel?.id || channel.channel_type !== 'livechat') return;
    const cfg = getBaseConfig();
    const existingWidget = (cfg.widget ?? {}) as Record<string, unknown>;
    const existingPrechat = (existingWidget.prechat ?? {}) as Record<string, unknown>;
    updateChannel.mutate(
      {
        config: {
          ...cfg,
          welcome_message: widgetForm.welcome_description || undefined,
          widget: {
            ...existingWidget,
            site_name: widgetForm.site_name || undefined,
            welcome_title: widgetForm.welcome_title || undefined,
            welcome_description: widgetForm.welcome_description || undefined,
            response_time: widgetForm.response_time,
            widget_color: widgetForm.widget_color,
            primary_color: widgetForm.widget_color,
            position: widgetForm.position === 'left' ? 'left' : 'right',
            type: widgetForm.type,
            launcher_title: widgetForm.launcher_title || undefined,
            launcherTitle: widgetForm.launcher_title || undefined,
            avatar_url: widgetForm.avatar_url || undefined,
            available_message: widgetForm.available_message || undefined,
            unavailable_message: widgetForm.unavailable_message || undefined,
            prechat: existingPrechat,
          },
        },
      },
      {
        onSuccess: () => {
          setForm((prev) => ({ ...prev, avatar_url: widgetForm.avatar_url }));
        },
      }
    );
  };

  const saveBot = useMutation({
    mutationFn: async () => {
      if (!channel?.id) throw new Error('Channel required');
      const { data: existing } = await supabase
        .from('channel_agent_bots')
        .select('id')
        .eq('channel_id', channel.id)
        .maybeSingle();
      if (selectedBotId) {
        if (existing) {
          await supabase
            .from('channel_agent_bots')
            .update({ agent_bot_id: selectedBotId })
            .eq('channel_id', channel.id);
        } else {
          await supabase.from('channel_agent_bots').insert({
            channel_id: channel.id,
            agent_bot_id: selectedBotId,
          });
        }
      } else if (existing) {
        await supabase.from('channel_agent_bots').delete().eq('channel_id', channel.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-agent-bot', id] });
      toast.success('Bot vinculado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleChannelMember = useMutation({
    mutationFn: async ({
      memberId,
      add,
      allMemberIds,
    }: {
      memberId: string;
      add: boolean;
      allMemberIds?: string[];
    }) => {
      if (!id) return;
      if (add) {
        await supabase.from('channel_members').insert({
          channel_id: id,
          organization_member_id: memberId,
        });
      } else {
        if (channelMembers.length === 0 && allMemberIds) {
          const others = allMemberIds.filter((x) => x !== memberId);
          if (others.length > 0) {
            await supabase.from('channel_members').insert(
              others.map((omId) => ({ channel_id: id, organization_member_id: omId }))
            );
          }
        } else {
          await supabase
            .from('channel_members')
            .delete()
            .eq('channel_id', id)
            .eq('organization_member_id', memberId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', id] });
      toast.success('Agentes atualizados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const widgetScriptSnippet = React.useMemo(() => {
    const appUrl =
      (import.meta.env.VITE_PUBLIC_APP_URL as string)?.replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    let apiUrl = '';
    try {
      apiUrl = getFunctionsBaseUrl();
    } catch {
      apiUrl = '';
    }
    if (!channel?.public_token || !appUrl || !apiUrl) return '';
    return `<script src="${appUrl}/widget.js" data-inbox-token="${channel.public_token}" data-api-url="${apiUrl}" defer></script>`;
  }, [channel?.public_token]);

  const widgetScriptMissingEnv = React.useMemo(() => {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim();
    const appUrl =
      (import.meta.env.VITE_PUBLIC_APP_URL as string)?.trim() ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    return !channel?.public_token || !appUrl || !supabaseUrl;
  }, [channel?.public_token]);

  const copyWidgetScript = async () => {
    if (!widgetScriptSnippet) return;
    try {
      await navigator.clipboard.writeText(widgetScriptSnippet);
      setWidgetScriptCopied(true);
      toast.success('Script copiado');
      setTimeout(() => setWidgetScriptCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const providerLabel = React.useMemo(() => {
    if (!channel) return '';
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    if (channel.channel_type === 'whatsapp') {
      return cfg.whatsapp_provider === 'evolution' ? 'Evolution API' : 'Cloud do WhatsApp';
    }
    return channelLabels[channel.channel_type as string] ?? channel.channel_type;
  }, [channel]);

  const channelIdentifier = React.useMemo(() => {
    if (!channel) return '';
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    if (channel.channel_type === 'whatsapp') {
      if (cfg.whatsapp_provider === 'evolution') {
        const evo = (cfg.evolution ?? {}) as Record<string, unknown>;
        return (evo.instance_name as string) ?? '';
      }
      const meta = (cfg.meta ?? {}) as Record<string, unknown>;
      return (meta.phone_number_id as string) ?? '';
    }
    return '';
  }, [channel]);

  const isMemberInChannel = (memberId: string) => {
    if (channelMembers.length === 0) return true;
    return channelMembers.includes(memberId);
  };

  if (!id) return null;
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!channel) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Caixa não encontrada.</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/settings/inboxes">Voltar às Caixas de Entrada</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <aside className="w-full lg:w-52 shrink-0 border-b lg:border-b-0 lg:border-r bg-muted/30">
        <div className="p-4 space-y-1">
          <Link
            to="/settings/inboxes"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Caixas de Entrada
          </Link>
          <h1 className="text-lg font-bold truncate" title={channel.name}>
            {channel.name}
          </h1>
          {channelIdentifier && (
            <p className="text-xs text-muted-foreground truncate" title={channelIdentifier}>
              {channelIdentifier}
            </p>
          )}
        </div>
        <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible scrollbar-hide border-t lg:border-t-0 pt-2 lg:pt-0">
          {BASE_TABS.filter((tab) => {
            const t = tab as { livechatOnly?: boolean };
            if (t.livechatOnly && channel?.channel_type !== 'livechat') return false;
            return true;
          }).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 py-2.5 px-4 lg:px-4 text-sm font-medium whitespace-nowrap transition-colors w-full text-left',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary border-l-2 lg:border-l-2 border-primary -ml-px lg:ml-0'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
                {activeTab === tab.id && <ChevronRight className="h-4 w-4 ml-auto lg:hidden" />}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div
          className={cn(
            'p-6 lg:p-8 space-y-6',
            activeTab === 'widget' && channel?.channel_type === 'livechat' ? 'max-w-5xl' : 'max-w-3xl'
          )}
        >
          {activeTab === 'settings' && (
            <>
              <SectionCard
                title="Configurações da Caixa de Entrada"
                description="Atualize suas configurações de caixa de entrada."
                action={
                  canEdit && (
                    <Button onClick={saveSettings} disabled={updateChannel.isPending} size="sm">
                      {updateChannel.isPending ? 'A guardar…' : 'Atualizar'}
                    </Button>
                  )
                }
              >
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed bg-muted overflow-hidden"
                    style={{ borderColor: 'var(--primary)' }}
                  >
                    {form.avatar_url ? (
                      <img
                        src={form.avatar_url}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <Hash className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <Label>Imagem do canal</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        id="inbox-avatar-settings-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !channel?.id || !currentOrg?.id || !canEdit) return;
                          try {
                            const url = await uploadInboxAvatar(currentOrg.id, channel.id, file);
                            setForm((prev) => ({ ...prev, avatar_url: url }));
                            toast.success('Imagem carregada');
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Erro ao carregar');
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={!canEdit}
                        onClick={() => document.getElementById('inbox-avatar-settings-upload')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-1.5" />
                        Carregar imagem
                      </Button>
                      <span className="hidden sm:inline self-center text-muted-foreground text-sm">ou</span>
                      <Input
                        placeholder="Inserir URL da imagem"
                        value={form.avatar_url}
                        onChange={(e) => setForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                        disabled={!canEdit}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Carregue uma imagem (PNG, JPG, GIF, WebP até 2 MB) ou cole o link
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="inbox-name">Nome da Caixa de Entrada</Label>
                    <Input
                      id="inbox-name"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome da caixa"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Provedor de API</Label>
                    <Input value={providerLabel} readOnly disabled className="bg-muted" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Caixa ativa</Label>
                      <p className="text-xs text-muted-foreground">Receber e enviar mensagens</p>
                    </div>
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_active: v }))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ativar saudação do canal</Label>
                    <Select
                      value={form.greeting_enabled ? 'enabled' : 'disabled'}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, greeting_enabled: v === 'enabled' }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Desativado</SelectItem>
                        <SelectItem value="enabled">Ativado</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Enviar automaticamente uma mensagem de saudação quando uma nova conversa é criada.
                    </p>
                  </div>
                  {form.greeting_enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="welcome-message">Mensagem de saudação</Label>
                      <Textarea
                        id="welcome-message"
                        value={form.welcome_message}
                        onChange={(e) => setForm((prev) => ({ ...prev, welcome_message: e.target.value }))}
                        placeholder="Olá! Como podemos ajudar?"
                        rows={3}
                        disabled={!canEdit}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Centro de Ajuda</Label>
                    <Select
                      value={form.help_center_category_id || 'none'}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, help_center_category_id: v === 'none' ? '' : v }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar Centro de Ajuda" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {(helpCategories as { id: string; name: string }[]).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Anexe um Centro de Ajuda à caixa de entrada.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Bloquear para conversa única</Label>
                    <Select
                      value={form.lock_to_single_conversation ? 'enabled' : 'disabled'}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, lock_to_single_conversation: v === 'enabled' }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Desativado</SelectItem>
                        <SelectItem value="enabled">Ativado</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Uma única conversa por contato nesta caixa de entrada.
                    </p>
                  </div>
                </div>
              </SectionCard>

              {channel.channel_type === 'whatsapp' && (
                <SectionCard
                  title="Diagnóstico de mídia"
                  description="Verifica Evolution, secrets S3, URL pública, probe de escrita e histórico. Opcionalmente envia uma imagem de teste (mesmo caminho que anexos nas conversas)."
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={mediaDiagLoading}
                        onClick={async () => {
                          if (!channel?.id) return;
                          setMediaDiagLoading(true);
                          setMediaDiagResult(null);
                          try {
                            const res = await invokeEdgeFunctionJson<Record<string, unknown>>(
                              'media-pipeline-diagnostic',
                              { channel_id: channel.id },
                              90_000,
                            );
                            if (res.error) {
                              toast.error(res.error.message);
                              return;
                            }
                            setMediaDiagResult(res.data);
                            const issues = res.data.issues as string[] | undefined;
                            if (issues?.length) {
                              toast.info('Diagnóstico concluído', {
                                description: `${issues.length} alerta(s) — veja o painel abaixo.`,
                              });
                            } else {
                              toast.success('Diagnóstico concluído');
                            }
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Erro ao executar diagnóstico');
                          } finally {
                            setMediaDiagLoading(false);
                          }
                        }}
                      >
                        <Stethoscope className="h-4 w-4 mr-2" />
                        {mediaDiagLoading ? 'A analisar…' : 'Executar diagnóstico'}
                      </Button>
                      <input
                        ref={mediaDiagFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={() => {
                          /* só escolha de ficheiro; envio no botão seguinte */
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={mediaDiagLoading}
                        onClick={() => mediaDiagFileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Escolher imagem
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={mediaDiagLoading}
                        onClick={async () => {
                          if (!channel?.id) return;
                          const input = mediaDiagFileInputRef.current;
                          const file = input?.files?.[0];
                          if (!file) {
                            toast.error('Escolha primeiro uma imagem (JPEG, PNG, GIF ou WebP, máx. 2 MB).');
                            return;
                          }
                          if (file.size > 2 * 1024 * 1024) {
                            toast.error('Imagem demasiado grande (máx. 2 MB para teste).');
                            return;
                          }
                          setMediaDiagLoading(true);
                          setMediaDiagResult(null);
                          try {
                            const fd = new FormData();
                            fd.append('channel_id', channel.id);
                            fd.append('test_image', file);
                            const res = await invokeEdgeFunctionFormData<Record<string, unknown>>(
                              'media-pipeline-diagnostic',
                              fd,
                              120_000,
                            );
                            if (res.error) {
                              toast.error(res.error.message);
                              return;
                            }
                            setMediaDiagResult(res.data);
                            const upload = res.data.test_image_upload as
                              | { ok?: boolean; url?: string; error?: string; storage_backend?: string }
                              | null
                              | undefined;
                            const issues = res.data.issues as string[] | undefined;
                            if (upload?.ok && upload.url) {
                              toast.success('Diagnóstico + upload de teste OK', {
                                description: `Backend: ${upload.storage_backend ?? '—'}. URL no JSON.`,
                              });
                            } else if (issues?.length) {
                              toast.info('Diagnóstico concluído', {
                                description: `${issues.length} alerta(s) — veja test_image_upload no painel.`,
                              });
                            } else {
                              toast.success('Diagnóstico concluído');
                            }
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Erro no diagnóstico com imagem');
                          } finally {
                            setMediaDiagLoading(false);
                          }
                        }}
                      >
                        Diagnóstico + upload de teste
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O upload de teste grava em <code className="text-[11px]">…/__diagnostic__/</code> no bucket (S3 ou
                      Storage), como nas conversas. Abra o URL em <code className="text-[11px]">test_image_upload</code>{' '}
                      se <code className="text-[11px]">ok: true</code>.
                    </p>
                    {mediaDiagResult && (
                      <pre className="text-xs bg-muted/50 border rounded-lg p-3 overflow-x-auto max-h-[420px] overflow-y-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(mediaDiagResult, null, 2)}
                      </pre>
                    )}
                  </div>
                </SectionCard>
              )}
            </>
          )}

          {activeTab === 'agents' && (
            <SectionCard
              title="Agentes desta caixa"
              description="Selecione os agentes que podem atender conversas nesta caixa. Se nenhum for selecionado, todos os membros da equipa têm acesso."
            >
              <div className="space-y-2">
                {(members as { id: string; display_name: string; role: string; status: string }[]).map((m) => {
                  const isIn = isMemberInChannel(m.id);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg border hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {m.display_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{m.display_name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                        </div>
                      </div>
                      {canEdit && (
                        <Button
                          variant={isIn ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() =>
                            toggleChannelMember.mutate({
                              memberId: m.id,
                              add: !isIn,
                              allMemberIds: channelMembers.length === 0 ? (members as { id: string }[]).map((x) => x.id) : undefined,
                            })
                          }
                          disabled={toggleChannelMember.isPending}
                        >
                          {isIn ? (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Remover
                            </>
                          ) : (
                            'Adicionar'
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {members.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Nenhum agente na equipa.</p>
                )}
              </div>
            </SectionCard>
          )}

          {activeTab === 'hours' && (
            <SectionCard
              title="Horário de funcionamento"
              description="Defina quando a caixa está disponível. Fora do horário, os clientes podem receber uma mensagem automática."
              action={
                canEdit && (
                  <Button onClick={saveWorkingHours} disabled={updateChannel.isPending} size="sm">
                    {updateChannel.isPending ? 'A guardar…' : 'Guardar'}
                  </Button>
                )
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Ativar horário de funcionamento</Label>
                    <p className="text-xs text-muted-foreground">Restringir atendimento a certos horários</p>
                  </div>
                  <Switch
                    checked={workingHoursForm.enabled}
                    onCheckedChange={(v) => setWorkingHoursForm({ ...workingHoursForm, enabled: v })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem fora do horário</Label>
                  <Textarea
                    value={workingHoursForm.out_of_office_message}
                    onChange={(e) =>
                      setWorkingHoursForm({ ...workingHoursForm, out_of_office_message: e.target.value })
                    }
                    placeholder="Estamos fora do horário. Deixe uma mensagem e responderemos em breve."
                    rows={3}
                    disabled={!canEdit}
                  />
                </div>
                {workingHoursForm.enabled && (
                  <div className="space-y-2">
                    <Label>Horário por dia</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Configure o horário de cada dia. "Aberto o dia todo" ou "Fechado" ignora o intervalo.
                    </p>
                    <div className="space-y-2">
                      {DAYS.map((d) => {
                        const wh = workingHoursForm.working_hours.find((w) => w.day_of_week === d.value) ?? defaultWorkingDay();
                        return (
                          <div key={d.value} className="flex flex-wrap items-center gap-2 py-2 border-b last:border-0">
                            <span className="w-24 text-sm">{d.label}</span>
                            <Switch
                              checked={!wh.closed_all_day}
                              onCheckedChange={(v) => {
                                const next = [...workingHoursForm.working_hours];
                                const idx = next.findIndex((x) => x.day_of_week === d.value);
                                if (idx >= 0) next[idx] = { ...next[idx], closed_all_day: !v };
                                setWorkingHoursForm({ ...workingHoursForm, working_hours: next });
                              }}
                              disabled={!canEdit}
                            />
                            <span className="text-xs text-muted-foreground">
                              {wh.closed_all_day ? 'Fechado' : 'Aberto'}
                            </span>
                            {!wh.closed_all_day && (
                              <span className="text-xs">
                                {wh.open_all_day
                                  ? '24h'
                                  : `${String(wh.open_hour).padStart(2, '0')}:${String(wh.open_minutes).padStart(2, '0')} - ${String(wh.close_hour).padStart(2, '0')}:${String(wh.close_minutes).padStart(2, '0')}`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {activeTab === 'prechat' && channel?.channel_type === 'livechat' && (
            <SectionCard
              title="Formulário Chat Pré"
              description="Formulários de bate-papo permitem que você capture informações de usuário antes de iniciar uma conversa."
              action={
                canEdit && (
                  <Button onClick={savePrechat} disabled={updateChannel.isPending} size="sm">
                    {updateChannel.isPending ? 'A guardar…' : 'Atualizar configurações do Formulário Pre Chat'}
                  </Button>
                )
              }
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Ativar formulário de bate-papo antes</Label>
                    <p className="text-xs text-muted-foreground">Exibir formulário para coletar dados antes de iniciar a conversa</p>
                  </div>
                  <Select
                    value={prechatForm.enabled ? 'yes' : 'no'}
                    onValueChange={(v) => setPrechatForm({ ...prechatForm, enabled: v === 'yes' })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Não</SelectItem>
                      <SelectItem value="yes">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem pré chat</Label>
                  <Textarea
                    value={prechatForm.message}
                    onChange={(e) => setPrechatForm({ ...prechatForm, message: e.target.value })}
                    placeholder="Preencha as informações abaixo, para iniciar seu atendimento."
                    rows={3}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Campos do formulário Pré Chat</Label>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="w-8 px-2 py-2 text-left" />
                          <th className="w-16 px-2 py-2 text-center font-medium">Ativo</th>
                          <th className="px-3 py-2 text-left font-medium">Chave</th>
                          <th className="px-3 py-2 text-left font-medium">Tipo</th>
                          <th className="w-24 px-3 py-2 text-center font-medium">Obrigatório</th>
                          <th className="px-3 py-2 text-left font-medium">Nome do campo</th>
                          <th className="px-3 py-2 text-left font-medium">Valor de exemplo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prechatForm.fields.map((field, idx) => (
                          <tr key={field.key} className="border-b last:border-0">
                            <td className="px-2 py-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <Switch
                                checked={field.enabled}
                                onCheckedChange={(v) => updatePrechatField(idx, { enabled: v })}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{field.key}</td>
                            <td className="px-3 py-2">
                              <Select
                                value={field.type}
                                onValueChange={(v) => updatePrechatField(idx, { type: v as PrechatField['type'] })}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">text</SelectItem>
                                  <SelectItem value="email">email</SelectItem>
                                  <SelectItem value="number">number</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                checked={field.required}
                                onCheckedChange={(v) => updatePrechatField(idx, { required: !!v })}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={field.label}
                                onChange={(e) => updatePrechatField(idx, { label: e.target.value })}
                                placeholder="Nome do campo"
                                className="h-8"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={field.placeholder}
                                onChange={(e) => updatePrechatField(idx, { placeholder: e.target.value })}
                                placeholder="Valor de exemplo"
                                className="h-8"
                                disabled={!canEdit}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'csat' && (
            <SectionCard
              title="Pesquisa de satisfação (CSAT)"
              description="Enviar inquérito de satisfação ao cliente quando a conversa for resolvida."
              action={
                canEdit && (
                  <Button onClick={saveCsat} disabled={updateChannel.isPending} size="sm">
                    {updateChannel.isPending ? 'A guardar…' : 'Guardar'}
                  </Button>
                )
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enviar inquérito ao resolver</Label>
                    <p className="text-xs text-muted-foreground">Pedir nota de 1 a 5 ao cliente</p>
                  </div>
                  <Switch
                    checked={csatForm.enabled}
                    onCheckedChange={(v) => setCsatForm({ ...csatForm, enabled: v })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem ao cliente</Label>
                  <Textarea
                    value={csatForm.message}
                    onChange={(e) => setCsatForm({ ...csatForm, message: e.target.value })}
                    placeholder={DEFAULT_CSAT_MESSAGE}
                    rows={4}
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">Inclua a indicação para responder com um número de 1 a 5.</p>
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'widget' && channel?.channel_type === 'livechat' && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 min-w-0 space-y-6">
                <SectionCard
                  title="Construtor de Widget"
                  description="Personalize a aparência e o comportamento do widget de chat no seu site."
                  action={
                    canEdit && (
                      <Button onClick={saveWidget} disabled={updateChannel.isPending} size="sm">
                        {updateChannel.isPending ? 'A guardar…' : 'Atualizar Configurações do Widget'}
                      </Button>
                    )
                  }
                >
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed bg-muted overflow-hidden"
                        style={{ borderColor: widgetForm.widget_color }}
                      >
                        {widgetForm.avatar_url ? (
                          <img
                            src={widgetForm.avatar_url}
                            alt="Avatar"
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <Hash className="h-7 w-7 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-2 flex-1 min-w-0">
                        <Label>Avatar do site</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            id="inbox-avatar-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file || !channel?.id || !currentOrg?.id || !canEdit) return;
                              try {
                                const url = await uploadInboxAvatar(currentOrg.id, channel.id, file);
                                setWidgetForm((prev) => ({ ...prev, avatar_url: url }));
                                toast.success('Avatar carregado');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Erro ao carregar');
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={!canEdit}
                            onClick={() => document.getElementById('inbox-avatar-upload')?.click()}
                          >
                            <Upload className="h-4 w-4 mr-1.5" />
                            Carregar imagem
                          </Button>
                          <span className="hidden sm:inline self-center text-muted-foreground text-sm">ou</span>
                          <Input
                            placeholder="Inserir URL da imagem"
                            value={widgetForm.avatar_url}
                            onChange={(e) => setWidgetForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                            disabled={!canEdit}
                            className="flex-1 min-w-0"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Carregue uma imagem (PNG, JPG, GIF, WebP até 2 MB) ou cole o link
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Nome do site</Label>
                      <Input
                        value={widgetForm.site_name}
                        onChange={(e) => setWidgetForm((prev) => ({ ...prev, site_name: e.target.value }))}
                        placeholder="Ex: Agents Labs - Portal"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Título de boas-vindas (welcomeTitle)</Label>
                      <Input
                        value={widgetForm.welcome_title}
                        onChange={(e) => setWidgetForm((prev) => ({ ...prev, welcome_title: e.target.value }))}
                        placeholder="Ex: Olá, tudo bem?"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição de boas-vindas (welcomeDescription)</Label>
                      <Textarea
                        value={widgetForm.welcome_description}
                        onChange={(e) =>
                          setWidgetForm((prev) => ({ ...prev, welcome_description: e.target.value.slice(0, 255) }))
                        }
                        placeholder="Sou o assistente virtual e posso ajudar com informações, dúvidas ou direcionar você para um atendente. Como posso ajudar?"
                        rows={4}
                        maxLength={255}
                        disabled={!canEdit}
                      />
                      <p className="text-xs text-muted-foreground">{widgetForm.welcome_description.length}/255</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tempo de Resposta</Label>
                      <Select
                        value={widgetForm.response_time}
                        onValueChange={(v) =>
                          setWidgetForm((prev) => ({
                            ...prev,
                            response_time: v as typeof prev.response_time,
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="few_minutes">Em alguns minutos</SelectItem>
                          <SelectItem value="few_hours">Em algumas horas</SelectItem>
                          <SelectItem value="same_day">No mesmo dia</SelectItem>
                          <SelectItem value="next_day">No próximo dia útil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cor do Widget (widgetColor)</Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="color"
                          className="h-10 w-14 p-1 cursor-pointer"
                          value={widgetForm.widget_color}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({ ...prev, widget_color: e.target.value }))
                          }
                          disabled={!canEdit}
                        />
                        <Input
                          value={widgetForm.widget_color}
                          onChange={(e) =>
                            setWidgetForm((prev) => ({ ...prev, widget_color: e.target.value }))
                          }
                          disabled={!canEdit}
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Posição do Balão do Widget</Label>
                      <RadioGroup
                        value={widgetForm.position}
                        onValueChange={(v) =>
                          setWidgetForm((prev) => ({ ...prev, position: v as 'right' | 'left' }))
                        }
                        className="flex gap-4"
                        disabled={!canEdit}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="right" />
                          <span>Direita</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="left" />
                          <span>Esquerda</span>
                        </label>
                      </RadioGroup>
                      <p className="text-xs text-muted-foreground">
                        Posição do launcher (Chatwoot: position). Esquerda ou direita no canto inferior.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de Balão do Widget (type)</Label>
                      <RadioGroup
                        value={widgetForm.type}
                        onValueChange={(v) =>
                          setWidgetForm((prev) => ({ ...prev, type: v as 'standard' | 'expanded_bubble' }))
                        }
                        className="flex gap-4"
                        disabled={!canEdit}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="standard" />
                          <span>Padrão (standard)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="expanded_bubble" />
                          <span>Bubble expandido (expanded_bubble)</span>
                        </label>
                      </RadioGroup>
                      <p className="text-xs text-muted-foreground">
                        Padrão: ícone circular compacto. Bubble expandido: cápsula com texto personalizado (launcherTitle).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Título do launcher (launcherTitle)</Label>
                      <Input
                        value={widgetForm.launcher_title}
                        onChange={(e) =>
                          setWidgetForm((prev) => ({ ...prev, launcher_title: e.target.value }))
                        }
                        placeholder="Ex: Fale conosco no chat"
                        disabled={!canEdit}
                      />
                      <p className="text-xs text-muted-foreground">
                        Texto exibido no bubble expandido quando type=expanded_bubble.
                      </p>
                    </div>
                  </div>
                </SectionCard>
                {channel?.public_token && (
                  <SectionCard
                    title="Script do Widget"
                    description="Cole antes do fechamento da tag &lt;/body&gt; do seu HTML. O widget carrega de forma assíncrona (defer)."
                  >
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Código para embed</Label>
                      {widgetScriptMissingEnv ? (
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                          <p className="font-medium">Configuração incompleta</p>
                          <p className="mt-1 text-xs">
                            Defina <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> e, para produção,{' '}
                            <code className="rounded bg-muted px-1">VITE_PUBLIC_APP_URL</code> no <code className="rounded bg-muted px-1">.env</code>.
                          </p>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Textarea
                            readOnly
                            value={widgetScriptSnippet}
                            rows={4}
                            className="font-mono text-xs resize-none"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            onClick={copyWidgetScript}
                          >
                            {widgetScriptCopied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        O script requer <code className="bg-muted px-1 rounded">data-inbox-token</code> e{' '}
                        <code className="bg-muted px-1 rounded">data-api-url</code>. Opcional: defina{' '}
                        <code className="bg-muted px-1 rounded">window.agentslabsWidgetSettings</code> antes para sobrescrever posição e tipo.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Se o widget não aparecer: publique a função <code className="bg-muted px-1 rounded">get-widget-config</code> com{' '}
                        <code className="bg-muted px-1 rounded">supabase functions deploy get-widget-config</code>. Consulte{' '}
                        <code className="bg-muted px-1 rounded">docs/WIDGET_TROUBLESHOOTING.md</code>.
                      </p>
                    </div>
                  </SectionCard>
                )}
              </div>
              <div className="lg:w-80 shrink-0">
                <div className="sticky top-6 rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Pré-visualizar</p>
                    <div className="flex gap-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded',
                          widgetForm.type === 'standard' && 'bg-primary/10 text-primary'
                        )}
                      >
                        standard
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded',
                          widgetForm.type === 'expanded_bubble' && 'bg-primary/10 text-primary'
                        )}
                      >
                        expanded_bubble
                      </span>
                    </div>
                  </div>
                  <div className="relative rounded-lg border bg-muted/20 overflow-hidden min-h-[280px]">
                    <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                      <span className="text-[10px] text-muted-foreground">
                        Simulação da página do site
                      </span>
                    </div>
                    {/* Widget simulado — card com informações + launcher */}
                    <div
                      className={cn(
                        'absolute bottom-4 flex flex-col gap-3 pointer-events-none',
                        widgetForm.position === 'left' ? 'left-4 items-start' : 'right-4 items-end'
                      )}
                    >
                      <div
                        className="w-[280px] rounded-xl border bg-card shadow-lg overflow-hidden"
                        style={{ borderLeft: `4px solid ${widgetForm.widget_color}` }}
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                              style={{ backgroundColor: widgetForm.widget_color + '30' }}
                            >
                              {widgetForm.avatar_url ? (
                                <img
                                  src={widgetForm.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <Hash className="h-5 w-5" style={{ color: widgetForm.widget_color }} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {widgetForm.site_name || 'Nome do site'}
                              </p>
                              <p className="text-xs text-muted-foreground">Estamos On-line</p>
                            </div>
                          </div>
                          <p className="font-medium text-sm">
                            {widgetForm.welcome_title || 'Olá, tudo bem?'}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {widgetForm.welcome_description ||
                              'Sou o assistente virtual e posso ajudar com informações, dúvidas ou direcionar você para um atendente. Como posso ajudar?'}
                          </p>
                          <span
                            className="text-xs font-medium inline-block"
                            style={{ color: widgetForm.widget_color }}
                          >
                            Iniciar Conversa →
                          </span>
                        </div>
                      </div>
                      {widgetForm.type === 'expanded_bubble' ? (
                        <div
                          className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg"
                          style={{ backgroundColor: widgetForm.widget_color }}
                        >
                          <span className="text-white text-lg">💬</span>
                          <span className="text-white text-sm font-medium whitespace-nowrap">
                            {widgetForm.launcher_title || 'Fale conosco no chat'}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg"
                          style={{ backgroundColor: widgetForm.widget_color }}
                          title={widgetForm.launcher_title}
                        >
                          <span className="text-white text-lg">💬</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <SectionCard
              title="Configuração avançada"
              description="Opções adicionais para o comportamento da caixa."
              action={
                canEdit && (
                  <Button onClick={saveAdvanced} disabled={updateChannel.isPending} size="sm">
                    {updateChannel.isPending ? 'A guardar…' : 'Guardar'}
                  </Button>
                )
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Permitir mensagens após resolver</Label>
                    <p className="text-xs text-muted-foreground">O contacto pode enviar mensagens após a conversa ser resolvida</p>
                  </div>
                  <Switch
                    checked={advancedForm.allow_messages_after_resolved}
                    onCheckedChange={(v) => setAdvancedForm({ ...advancedForm, allow_messages_after_resolved: v })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuso horário</Label>
                  <Select
                    value={advancedForm.timezone}
                    onValueChange={(v) => setAdvancedForm({ ...advancedForm, timezone: v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">São Paulo (BRT)</SelectItem>
                      <SelectItem value="America/New_York">Nova Iorque (EST)</SelectItem>
                      <SelectItem value="Europe/London">Londres (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tóquio (JST)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'bot' && (
            <SectionCard
              title="Configuração do Bot"
              description="Vincule um robô para processar eventos desta caixa via webhook."
              action={
                canEdit && (
                  <Button onClick={() => saveBot.mutate()} disabled={saveBot.isPending} size="sm">
                    {saveBot.isPending ? 'A guardar…' : 'Guardar'}
                  </Button>
                )
              }
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Bot vinculado</Label>
                  <Select
                    value={selectedBotId ?? 'none'}
                    onValueChange={(v) => setSelectedBotId(v === 'none' ? null : v)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar bot" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {(agentBots as { id: string; name: string; is_active: boolean }[]).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} {!b.is_active && '(inativo)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O bot recebe eventos (message_created, conversation_created) e pode responder via API.
                  </p>
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'health' && (
            <SectionCard
              title="Saúde da conta"
              description="Estado da conexão do canal."
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg border">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Heart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Provedor</p>
                    <p className="text-sm text-muted-foreground">{providerLabel}</p>
                  </div>
                  <div className="ml-auto">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-online/20 px-2.5 py-1 text-xs font-medium text-status-online">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-online" />
                      Operacional
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Para WhatsApp: verifique na Evolution API ou Meta Business Suite se a instância está conectada.
                </p>
              </div>
            </SectionCard>
          )}
        </div>
      </main>
    </div>
  );
};

export default InboxSettingsPage;
