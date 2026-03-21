import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Hash, Copy, Check } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import ProviderGrid from '@/components/channels/ProviderGrid';
import InboxWizard from '@/components/channels/InboxWizard';
import type { ChannelProvider } from '@/components/channels/providerCatalog';
import { getProviderById } from '@/components/channels/providerCatalog';
import { META_OAUTH_RESULT_KEY } from '@/lib/metaOAuth';
import { toast } from 'sonner';

type ChannelType = Database['public']['Enums']['channel_type'];

const channelMeta: Record<
  string,
  { label: string; color: string }
> = {
  whatsapp: { label: 'WhatsApp', color: 'text-channel-whatsapp' },
  messenger: { label: 'Messenger', color: 'text-channel-messenger' },
  instagram: { label: 'Instagram', color: 'text-channel-instagram' },
  telegram: { label: 'Telegram', color: 'text-channel-telegram' },
  email: { label: 'E-mail', color: 'text-channel-email' },
  livechat: { label: 'Live Chat', color: 'text-channel-livechat' },
  sms: { label: 'SMS', color: 'text-channel-sms' },
  api: { label: 'API', color: 'text-violet-500' },
  line: { label: 'LINE', color: 'text-green-500' },
};

const ChannelsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEditRouting =
    currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ChannelProvider | null>(null);
  const [metaPrefill, setMetaPrefill] = useState<Record<string, string | null> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const clearMetaPrefill = useCallback(() => setMetaPrefill(null), []);

  useEffect(() => {
    if (searchParams.get('meta_oauth') !== '1') return;
    const raw = sessionStorage.getItem(META_OAUTH_RESULT_KEY);
    sessionStorage.removeItem(META_OAUTH_RESULT_KEY);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('meta_oauth');
        return n;
      },
      { replace: true }
    );
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Record<string, string | null>;
      setMetaPrefill(data);
      const wp = getProviderById('whatsapp');
      if (wp) {
        setSelectedProvider(wp);
        setWizardOpen(true);
      }
      toast.success('Dados Meta carregados. Confirme o nome da caixa e avance.');
    } catch {
      toast.error('Não foi possível ler o resultado OAuth');
    }
  }, [searchParams, setSearchParams]);

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('channels')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const updateRouting = useMutation({
    mutationFn: async (payload: {
      id: string;
      auto_assign_enabled?: boolean;
      routing_skill_tags?: string[];
    }) => {
      const { error } = await supabase
        .from('channels')
        .update({
          ...(payload.auto_assign_enabled !== undefined && {
            auto_assign_enabled: payload.auto_assign_enabled,
          }),
          ...(payload.routing_skill_tags !== undefined && {
            routing_skill_tags: payload.routing_skill_tags,
          }),
        })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', currentOrg?.id] });
      toast.success('Roteamento actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openWizard = (p: ChannelProvider) => {
    setSelectedProvider(p);
    setPickerOpen(false);
    setWizardOpen(true);
  };

  const copyToken = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Token copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Caixas de entrada</h1>
            <p className="text-muted-foreground text-sm">
              Conecte canais omnichannel — escolha o provedor e siga o assistente de configuração
            </p>
          </div>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova caixa de entrada
          </Button>
        </div>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Escolha o provedor</DialogTitle>
              <DialogDescription>
                Cada caixa é um ponto de contato independente (Seção 17 — prompt técnico).
              </DialogDescription>
            </DialogHeader>
            <ProviderGrid
              onSelect={(p) => {
                if (p.comingSoon) return;
                openWizard(p);
              }}
            />
          </DialogContent>
        </Dialog>

        <InboxWizard
          open={wizardOpen}
          onOpenChange={(v) => {
            setWizardOpen(v);
            if (!v) {
              setSelectedProvider(null);
              setMetaPrefill(null);
            }
          }}
          provider={selectedProvider}
          metaPrefill={metaPrefill}
          onMetaPrefillConsumed={clearMetaPrefill}
        />

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          {channels.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-xl border-dashed">
              <Hash className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma caixa configurada</p>
              <p className="text-xs mt-1">Adicione WhatsApp, e-mail, live chat ou outro canal</p>
              <Button variant="outline" className="mt-4" onClick={() => setPickerOpen(true)}>
                Nova caixa de entrada
              </Button>
            </div>
          ) : (
            channels.map(
              (channel: {
                id: string;
                name: string;
                channel_type: ChannelType;
                is_active: boolean | null;
                public_token?: string;
                auto_assign_enabled?: boolean | null;
                routing_skill_tags?: string[] | null;
              }) => {
              const meta = channelMeta[channel.channel_type] || {
                label: channel.channel_type,
                color: '',
              };
              return (
                <div
                  key={channel.id}
                  className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow space-y-3"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${meta.color}`}
                    >
                      <Hash className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{channel.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.label}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span
                          className={`h-2 w-2 rounded-full ${channel.is_active ? 'bg-status-online' : 'bg-status-offline'}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {channel.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {channel.public_token && (
                    <div className="pt-2 border-t space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Token público
                      </p>
                      <div className="flex gap-1">
                        <code className="text-[10px] bg-muted px-2 py-1 rounded truncate flex-1 font-mono">
                          {channel.public_token}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => copyToken(channel.id, channel.public_token!)}
                        >
                          {copiedId === channel.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                  {canEditRouting && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Roteamento inteligente
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs">Atribuir automaticamente a agentes online</span>
                        <Switch
                          checked={channel.auto_assign_enabled !== false}
                          onCheckedChange={(v) =>
                            updateRouting.mutate({ id: channel.id, auto_assign_enabled: v })
                          }
                          disabled={updateRouting.isPending}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tags do canal (opcional)</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="ex.: suporte, vendas"
                          defaultValue={(channel.routing_skill_tags ?? []).join(', ')}
                          onBlur={(e) => {
                            const tags = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const prev = (channel.routing_skill_tags ?? []).join(',');
                            const next = tags.join(',');
                            if (prev !== next) {
                              updateRouting.mutate({ id: channel.id, routing_skill_tags: tags });
                            }
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Agentes com as mesmas tags na equipa recebem prioridade; se vazio, qualquer agente
                          disponível.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelsPage;
