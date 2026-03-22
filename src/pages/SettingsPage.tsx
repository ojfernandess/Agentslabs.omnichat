import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, User, Shield, Bot, Webhook, Copy, Check, Trash2, Plus, Star, Volume2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { WEBHOOK_EVENT_GROUPS, ALL_WEBHOOK_EVENT_IDS } from '@/lib/webhookEvents';
import { parseCsatSettings, mergeCsatIntoOrgSettings, DEFAULT_CSAT_MESSAGE } from '@/lib/csatSettings';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import type { Tables, Json } from '@/integrations/supabase/types';

type AgentBot = Tables<'agent_bots'>;
type OutboundWebhook = Tables<'outbound_webhooks'>;

const SETTINGS_SECTION_TO_TAB: Record<string, 'general' | 'bots' | 'webhooks'> = {
  account: 'general',
  bots: 'bots',
  webhooks: 'webhooks',
};

const SETTINGS_TAB_TO_SECTION: Record<'general' | 'bots' | 'webhooks', string> = {
  general: 'account',
  bots: 'bots',
  webhooks: 'webhooks',
};

const SettingsPage: React.FC = () => {
  const location = useLocation();
  const section = location.pathname.split('/').pop() ?? 'account';
  const navigate = useNavigate();
  const { currentOrg, currentMember, refetch: refetchOrgs } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const settingsTab = SETTINGS_SECTION_TO_TAB[section] ?? 'general';

  useEffect(() => {
    if (!SETTINGS_SECTION_TO_TAB[section]) {
      navigate('/settings/account', { replace: true });
    }
  }, [section, navigate]);

  const [botDialog, setBotDialog] = useState(false);
  const [botForm, setBotForm] = useState({ name: '', description: '', outgoing_webhook_url: '' });
  const [newBotToken, setNewBotToken] = useState<string | null>(null);

  const [hookDialog, setHookDialog] = useState(false);
  const [hookForm, setHookForm] = useState({
    name: '',
    url: '',
    events: [] as string[],
  });
  const [newHookSecret, setNewHookSecret] = useState<string | null>(null);

  const [deleteBot, setDeleteBot] = useState<AgentBot | null>(null);
  const [deleteHook, setDeleteHook] = useState<OutboundWebhook | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canEditOrgSettings =
    currentMember && ['owner', 'admin'].includes(currentMember.role);

  const { play, isEnabled: soundEnabled, setEnabled: setSoundEnabled } = useNotificationSound();

  const [csatEnabled, setCsatEnabled] = useState(false);
  const [csatMessage, setCsatMessage] = useState(DEFAULT_CSAT_MESSAGE);

  useEffect(() => {
    const c = parseCsatSettings(currentOrg?.settings);
    setCsatEnabled(c.enabled);
    setCsatMessage(c.message || DEFAULT_CSAT_MESSAGE);
  }, [currentOrg?.id, currentOrg?.settings]);

  const saveCsat = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error('Sem organização');
      const base = (currentOrg.settings as Record<string, unknown> | null) ?? {};
      const next = mergeCsatIntoOrgSettings(base, {
        enabled: csatEnabled,
        message: csatMessage.trim() || DEFAULT_CSAT_MESSAGE,
      });
      const { error } = await supabase
        .from('organizations')
        .update({ settings: next as unknown as Json })
        .eq('id', currentOrg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Pesquisa CSAT guardada');
      refetchOrgs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['agent_bots', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('agent_bots')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AgentBot[];
    },
    enabled: !!currentOrg,
  });

  const { data: webhooks = [] } = useQuery({
    queryKey: ['outbound_webhooks', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('outbound_webhooks')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as OutboundWebhook[];
    },
    enabled: !!currentOrg,
  });

  const createBot = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error('Sem organização');
      const { data, error } = await supabase
        .from('agent_bots')
        .insert({
          organization_id: currentOrg.id,
          name: botForm.name.trim(),
          description: botForm.description.trim() || null,
          outgoing_webhook_url: botForm.outgoing_webhook_url.trim(),
        })
        .select('access_token')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent_bots'] });
      setNewBotToken(data.access_token);
      setBotForm({ name: '', description: '', outgoing_webhook_url: '' });
      toast.success('Agent Bot criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBot = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('agent_bots').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_bots'] });
      toast.success('Status atualizado');
    },
  });

  const removeBot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_bots').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_bots'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Bot removido');
      setDeleteBot(null);
    },
  });

  const createHook = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error('Sem organização');
      if (hookForm.events.length === 0) throw new Error('Selecione ao menos um evento');
      const { data, error } = await supabase
        .from('outbound_webhooks')
        .insert({
          organization_id: currentOrg.id,
          name: hookForm.name.trim(),
          url: hookForm.url.trim(),
          events: hookForm.events,
        })
        .select('secret')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      setNewHookSecret(data.secret);
      setHookForm({ name: '', url: '', events: [] });
      toast.success('Webhook criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleHook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('outbound_webhooks').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      toast.success('Status atualizado');
    },
  });

  const removeHook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('outbound_webhooks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      toast.success('Webhook removido');
      setDeleteHook(null);
    },
  });

  const copyTxt = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Copiado');
  };

  const toggleEvent = (id: string, checked: boolean) => {
    setHookForm((f) => ({
      ...f,
      events: checked ? [...f.events, id] : f.events.filter((e) => e !== id),
    }));
  };

  const selectAllEvents = () => {
    setHookForm((f) => ({
      ...f,
      events: f.events.length === ALL_WEBHOOK_EVENT_IDS.length ? [] : [...ALL_WEBHOOK_EVENT_IDS],
    }));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">
            Organização, Agent Bots (Seção 18) e Webhooks de saída (Seção 19)
          </p>
        </div>

        <Tabs
          value={settingsTab}
          onValueChange={(v) => {
            const tab = v as 'general' | 'bots' | 'webhooks';
            navigate(`/settings/${SETTINGS_TAB_TO_SECTION[tab]}`);
          }}
          className="space-y-6"
        >
          <TabsList>
            <TabsTrigger value="general">Conta</TabsTrigger>
            <TabsTrigger value="bots" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Robôs
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5">
              <Webhook className="h-3.5 w-3.5" />
              Webhooks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-8 animate-fade-in">
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Organização</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={currentOrg?.name || ''} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={currentOrg?.slug || ''} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Input value={currentOrg?.plan || 'free'} readOnly className="capitalize" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Star className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Pesquisa de satisfação (CSAT)</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Estilo Chatwoot: ao resolver uma conversa, o cliente pode receber uma mensagem a pedir nota de 1 a 5
                (canal WhatsApp). A nota fica registada na conversa.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="csat-enabled">Enviar inquérito ao resolver</Label>
                  <p className="text-xs text-muted-foreground">
                    Desligado: a nota continua a ser pedida apenas ao agente no painel.
                  </p>
                </div>
                <Switch
                  id="csat-enabled"
                  checked={csatEnabled}
                  onCheckedChange={setCsatEnabled}
                  disabled={!canEditOrgSettings}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="csat-message">Texto da mensagem ao cliente</Label>
                <Textarea
                  id="csat-message"
                  rows={4}
                  value={csatMessage}
                  onChange={(e) => setCsatMessage(e.target.value)}
                  disabled={!canEditOrgSettings}
                  placeholder={DEFAULT_CSAT_MESSAGE}
                  className="resize-y min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  Inclua a indicação para responder com um número de 1 a 5.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => saveCsat.mutate()}
                disabled={!canEditOrgSettings || saveCsat.isPending}
              >
                {saveCsat.isPending ? 'A guardar…' : 'Guardar CSAT'}
              </Button>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Minha conta</h2>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sound-enabled" className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    Aviso sonoro de novas mensagens
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Reproduz um som quando chega uma mensagem em conversas não visualizadas.
                  </p>
                </div>
                <Switch
                  id="sound-enabled"
                  checked={soundEnabled()}
                  onCheckedChange={(v) => {
                    setSoundEnabled(v);
                    if (v) play();
                  }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={user?.email || ''} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={currentMember?.display_name || user?.user_metadata?.display_name || ''}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Papel</Label>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Input value={currentMember?.role || ''} readOnly className="capitalize" />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bots" className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-start gap-4">
              <p className="text-sm text-muted-foreground max-w-xl">
                Robôs externos recebem eventos via webhook e respondem pela API com o access token.
                Vincule um bot ao criar ou editar uma caixa de entrada.
              </p>
              <Button
                onClick={() => {
                  setNewBotToken(null);
                  setBotDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar bot
              </Button>
            </div>

            <div className="rounded-xl border divide-y">
              {bots.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum Agent Bot configurado
                </p>
              ) : (
                bots.map((b) => (
                  <div key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.outgoing_webhook_url}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Ativo</span>
                        <Switch
                          checked={b.is_active}
                          onCheckedChange={(v) => toggleBot.mutate({ id: b.id, is_active: v })}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteBot(b)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-start gap-4">
              <p className="text-sm text-muted-foreground max-w-xl">
                Envie eventos para n8n, Make, Zapier ou sistemas próprios. Assinatura HMAC conforme
                Seção 19.5 (implementação no backend).
              </p>
              <Button
                onClick={() => {
                  setNewHookSecret(null);
                  setHookDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo webhook
              </Button>
            </div>

            <div className="rounded-xl border divide-y">
              {webhooks.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum webhook de saída configurado
                </p>
              ) : (
                webhooks.map((w) => (
                  <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium">{w.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{w.url}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {w.events.length} evento(s) assinado(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Ativo</span>
                        <Switch
                          checked={w.is_active}
                          onCheckedChange={(v) => toggleHook.mutate({ id: w.id, is_active: v })}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteHook(w)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Bot create */}
        <Dialog
          open={botDialog}
          onOpenChange={(o) => {
            setBotDialog(o);
            if (!o) setNewBotToken(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{newBotToken ? 'Access token do bot' : 'Novo Agent Bot'}</DialogTitle>
              <DialogDescription>
                {newBotToken
                  ? 'Copie agora. O token não será exibido novamente neste fluxo.'
                  : 'URL para onde a plataforma enviará eventos (message_created, etc.)'}
              </DialogDescription>
            </DialogHeader>
            {newBotToken ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly className="font-mono text-xs" value={newBotToken} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyTxt('tok', newBotToken)}
                  >
                    {copied === 'tok' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setBotDialog(false);
                      setNewBotToken(null);
                    }}
                  >
                    Concluir
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={botForm.name}
                    onChange={(e) => setBotForm({ ...botForm, name: e.target.value })}
                    placeholder="Bot Suporte"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={botForm.description}
                    onChange={(e) => setBotForm({ ...botForm, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL (outgoing)</Label>
                  <Input
                    value={botForm.outgoing_webhook_url}
                    onChange={(e) => setBotForm({ ...botForm, outgoing_webhook_url: e.target.value })}
                    placeholder="https://seu-servidor.com/webhook"
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={!botForm.name.trim() || !botForm.outgoing_webhook_url.trim() || createBot.isPending}
                    onClick={() => createBot.mutate()}
                  >
                    Criar e gerar token
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Webhook create */}
        <Dialog
          open={hookDialog}
          onOpenChange={(o) => {
            setHookDialog(o);
            if (!o) setNewHookSecret(null);
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{newHookSecret ? 'Secret do webhook' : 'Novo webhook'}</DialogTitle>
              <DialogDescription>
                {newHookSecret
                  ? 'Guarde o secret para validar X-Platform-Signature no receptor.'
                  : 'Selecione os eventos e a URL HTTPS de destino.'}
              </DialogDescription>
            </DialogHeader>
            {newHookSecret ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly className="font-mono text-xs" value={newHookSecret} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyTxt('sec', newHookSecret)}
                  >
                    {copied === 'sec' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setHookDialog(false);
                      setNewHookSecret(null);
                    }}
                  >
                    Concluir
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={hookForm.name}
                    onChange={(e) => setHookForm({ ...hookForm, name: e.target.value })}
                    placeholder="n8n automação"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={hookForm.url}
                    onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Eventos</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllEvents}>
                      {hookForm.events.length === ALL_WEBHOOK_EVENT_IDS.length ? 'Limpar' : 'Selecionar todos'}
                    </Button>
                  </div>
                  <ScrollArea className="h-48 rounded-md border p-3">
                    <div className="space-y-4">
                      {WEBHOOK_EVENT_GROUPS.map((group) => (
                        <div key={group.label}>
                          <p className="text-xs font-medium text-muted-foreground mb-2">{group.label}</p>
                          <div className="space-y-2">
                            {group.events.map((ev) => (
                              <label key={ev.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={hookForm.events.includes(ev.id)}
                                  onCheckedChange={(c) => toggleEvent(ev.id, c === true)}
                                />
                                <span>{ev.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <DialogFooter>
                  <Button
                    disabled={!hookForm.name.trim() || !hookForm.url.trim() || createHook.isPending}
                    onClick={() => createHook.mutate()}
                  >
                    Criar webhook
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteBot} onOpenChange={() => setDeleteBot(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Agent Bot?</AlertDialogTitle>
              <AlertDialogDescription>
                Vínculos com caixas de entrada serão removidos em cascata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteBot && removeBot.mutate(deleteBot.id)}>
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteHook} onOpenChange={() => setDeleteHook(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover webhook?</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteHook && removeHook.mutate(deleteHook.id)}>
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default SettingsPage;
