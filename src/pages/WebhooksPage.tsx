import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Play, Plus, RefreshCw, Settings2, Copy, Check } from 'lucide-react';
import {
  WEBHOOK_EVENT_GROUPS,
  ALL_WEBHOOK_EVENT_IDS,
} from '@/lib/webhookEvents';
import { getFunctionUrl } from '@/lib/runtimeEnv';
import {
  MISSING_TABLE_STORAGE_KEYS,
  isMissingRestTableError,
  readMissingTableFlag,
  setMissingTableFlag,
  clearMissingTableFlag,
} from '@/lib/supabaseMissingTable';

const CHATWOOT_CORE_EVENTS = [
  'conversation_created',
  'conversation_status_changed',
  'conversation_updated',
  'message_created',
  'message_updated',
  'contact_created',
  'contact_updated',
  'webwidget_triggered',
] as const;

type WebhookRow = {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
};

const WebhooksPage: React.FC = () => {
  const location = useLocation();
  const pageTitle = location.pathname.includes('/settings/integrations')
    ? 'Integrações'
    : 'Webhooks de saída';
  const { currentOrg, currentMember } = useOrg();
  const allowed =
    currentMember &&
    ['owner', 'admin', 'supervisor'].includes(currentMember.role);
  if (currentMember && !allowed) {
    return <Navigate to="/inbox" replace />;
  }
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configHook, setConfigHook] = useState<WebhookRow | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(CHATWOOT_CORE_EVENTS));
  const [configUrl, setConfigUrl] = useState('');
  const [configEvents, setConfigEvents] = useState<Set<string>>(new Set());

  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ['outbound_webhooks', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('outbound_webhooks')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const logsStorageKey = MISSING_TABLE_STORAGE_KEYS.webhookDeliveryLogs;

  const [skipLogsFetch, setSkipLogsFetch] = useState(() => readMissingTableFlag(logsStorageKey));

  const { data: logsResult } = useQuery({
    queryKey: ['webhook_delivery_logs', currentOrg?.id],
    queryFn: async (): Promise<{ rows: Record<string, unknown>[]; tableMissing: boolean }> => {
      if (!currentOrg) return { rows: [], tableMissing: false };
      const { data, error } = await supabase
        .from('webhook_delivery_logs')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (isMissingRestTableError(error)) {
          setMissingTableFlag(logsStorageKey);
          setSkipLogsFetch(true);
          return { rows: [], tableMissing: true };
        }
        throw error;
      }
      clearMissingTableFlag(logsStorageKey);
      setSkipLogsFetch(false);
      return { rows: data ?? [], tableMissing: false };
    },
    enabled: !!currentOrg && !skipLogsFetch,
  });

  const logs = logsResult?.rows ?? [];
  const logsTableMissing = skipLogsFetch || (logsResult?.tableMissing ?? false);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error('Org');
      const events = selectedEvents.size === 0 || selectedEvents.has('*')
        ? ['*']
        : Array.from(selectedEvents);
      const { error } = await supabase.from('outbound_webhooks').insert({
        organization_id: currentOrg.id,
        name: name.trim(),
        url: url.trim(),
        events,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      setCreateOpen(false);
      setName('');
      setUrl('');
      setSelectedEvents(new Set(CHATWOOT_CORE_EVENTS));
      toast.success('Webhook criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!configHook) return;
      const events = configEvents.size === 0 ? ['*'] : Array.from(configEvents);
      const { error } = await supabase
        .from('outbound_webhooks')
        .update({ url: configUrl.trim(), events })
        .eq('id', configHook.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      setConfigOpen(false);
      setConfigHook(null);
      toast.success('Webhook configurado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testWebhook = async (id: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) {
      toast.error('Sessão inválida');
      return;
    }
    const res = await fetch(getFunctionUrl('test-webhook'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ outbound_webhook_id: id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((json as { error?: string }).error || 'Falha no teste');
      return;
    }
    const j = json as { ok?: boolean; http_status?: number; response_excerpt?: string };
    toast.success(
      j.ok ? `HTTP ${j.http_status ?? '—'} — endpoint respondeu` : `HTTP ${j.http_status ?? '—'} (ver detalhes)`
    );
  };

  const openConfigure = (h: WebhookRow) => {
    setConfigHook(h);
    setConfigUrl(h.url);
    setConfigEvents(
      h.events?.includes('*') ? new Set(ALL_WEBHOOK_EVENT_IDS) : new Set(h.events ?? [])
    );
    setConfigOpen(true);
  };

  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(secret);
      toast.success('Segredo copiado');
      setTimeout(() => setCopiedSecret(null), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const toggleEvent = (eventId: string, isCreate: boolean) => {
    if (isCreate) {
      setSelectedEvents((prev) => {
        const next = new Set(prev);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
    } else {
      setConfigEvents((prev) => {
        const next = new Set(prev);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
    }
  };

  const toggleAllEvents = (checked: boolean, isCreate: boolean) => {
    if (isCreate) {
      setSelectedEvents(checked ? new Set(ALL_WEBHOOK_EVENT_IDS) : new Set());
    } else {
      setConfigEvents(checked ? new Set(ALL_WEBHOOK_EVENT_IDS) : new Set());
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">
              URLs, evento subscriptions, teste e histórico. Payload Chatwoot: event, id, content, sender, contact, conversation, account.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo webhook
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">A carregar…</p>
        ) : (
          <div className="space-y-4">
            {hooks.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  Nenhum webhook configurado. Crie um para receber eventos na sua API.
                </CardContent>
              </Card>
            ) : (
              hooks.map((h: WebhookRow) => (
                <Card key={h.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                      <CardTitle className="text-lg">{h.name}</CardTitle>
                      <CardDescription className="break-all mt-1">{h.url}</CardDescription>
                      <p className="text-xs text-muted-foreground mt-2">
                        Último envio:{' '}
                        {h.last_delivery_at
                          ? new Date(h.last_delivery_at).toLocaleString('pt-BR')
                          : '—'}{' '}
                        · Estado: {h.last_delivery_status ?? '—'}
                      </p>
                      {h.secret && (
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                            {h.secret.slice(0, 12)}…
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => copySecret(h.secret)}
                          >
                            {copiedSecret === h.secret ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-2">
                        HMAC: use <code>X-Platform-Signature</code> (sha256=hex) e{' '}
                        <code>X-Platform-Timestamp</code> para verificar a assinatura.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openConfigure(h)}
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" />
                        Configurar
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => testWebhook(h.id)}>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Testar
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Verificação HMAC</CardTitle>
              <CardDescription>
                Os webhooks incluem cabeçalhos <code className="text-xs">X-Platform-Signature</code> e{' '}
                <code className="text-xs">X-Platform-Timestamp</code>. Para verificar: concatene{' '}
                <code className="text-xs">timestamp + &quot;.&quot; + rawBody</code>, calcule HMAC-SHA256 com o
                segredo e compare com o valor de X-Platform-Signature (formato sha256=hex).
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Log de erros (entregas mortas)</CardTitle>
              <CardDescription>
                Registos criados quando a fila marca o envio como <code className="text-xs">dead</code>
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearMissingTableFlag(logsStorageKey);
                setSkipLogsFetch(false);
                queryClient.invalidateQueries({ queryKey: ['webhook_delivery_logs', currentOrg?.id] });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            {logsTableMissing ? (
              <p className="text-sm text-muted-foreground">
                O histórico de entregas ainda não está disponível neste projeto (tabela não criada). Aplique as
                migrations Supabase que incluem <code className="text-xs">webhook_delivery_logs</code> e prima
                «Atualizar».
              </p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem falhas registadas neste período.</p>
            ) : (
              <div className="rounded-md border max-h-[360px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Quando</th>
                      <th className="text-left p-2 font-medium">Evento</th>
                      <th className="text-left p-2 font-medium">HTTP</th>
                      <th className="text-left p-2 font-medium">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: Record<string, unknown>) => (
                      <tr key={String(log.id)} className="border-t">
                        <td className="p-2 whitespace-nowrap text-xs">
                          {new Date(String(log.created_at ?? '')).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-2 text-xs">{String(log.event_name ?? '—')}</td>
                        <td className="p-2 text-xs">{String(log.http_status ?? '—')}</td>
                        <td className="p-2 text-xs text-destructive max-w-md truncate" title={String(log.error_excerpt ?? '')}>
                          {String(log.error_excerpt ?? '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo webhook de saída</DialogTitle>
            <DialogDescription>
              O segredo HMAC é gerado automaticamente. Subscreva os eventos que deseja receber.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM principal" />
            </div>
            <div className="space-y-2">
              <Label>URL HTTPS</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.exemplo.com/webhooks/plataforma" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Subscrever eventos</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="create-select-all"
                    checked={selectedEvents.size === ALL_WEBHOOK_EVENT_IDS.length}
                    onCheckedChange={(c) => toggleAllEvents(!!c, true)}
                  />
                  <label htmlFor="create-select-all">Todos</label>
                </div>
              </div>
              <div className="rounded border p-3 max-h-[200px] overflow-y-auto space-y-2">
                {WEBHOOK_EVENT_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-3">
                      {group.events.map((e) => (
                        <div key={e.id} className="flex items-center gap-1.5">
                          <Checkbox
                            id={`create-${e.id}`}
                            checked={selectedEvents.has(e.id)}
                            onCheckedChange={() => toggleEvent(e.id, true)}
                          />
                          <label htmlFor={`create-${e.id}`} className="text-xs cursor-pointer">
                            {e.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!name.trim() || !url.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configOpen} onOpenChange={(v) => !v && setConfigOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar webhook</DialogTitle>
            <DialogDescription>
              Atualize a URL e os eventos subscritos. O segredo permanece o mesmo.
            </DialogDescription>
          </DialogHeader>
          {configHook && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>URL HTTPS</Label>
                <Input
                  value={configUrl}
                  onChange={(e) => setConfigUrl(e.target.value)}
                  placeholder="https://api.exemplo.com/webhooks/plataforma"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Subscrever eventos</Label>
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="config-select-all"
                      checked={configEvents.size === ALL_WEBHOOK_EVENT_IDS.length}
                      onCheckedChange={(c) => toggleAllEvents(!!c, false)}
                    />
                    <label htmlFor="config-select-all">Todos</label>
                  </div>
                </div>
                <div className="rounded border p-3 max-h-[200px] overflow-y-auto space-y-2">
                  {WEBHOOK_EVENT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                      <div className="flex flex-wrap gap-3">
                        {group.events.map((e) => (
                          <div key={e.id} className="flex items-center gap-1.5">
                            <Checkbox
                              id={`config-${e.id}`}
                              checked={configEvents.has(e.id)}
                              onCheckedChange={() => toggleEvent(e.id, false)}
                            />
                            <label htmlFor={`config-${e.id}`} className="text-xs cursor-pointer">
                              {e.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!configUrl.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebhooksPage;
