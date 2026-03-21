import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Play, Plus, RefreshCw } from 'lucide-react';
import {
  MISSING_TABLE_STORAGE_KEYS,
  isMissingRestTableError,
  readMissingTableFlag,
  setMissingTableFlag,
  clearMissingTableFlag,
} from '@/lib/supabaseMissingTable';

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
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

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

  /** Se true, não fazemos GET (evita 404 repetido após detetar tabela em falta). */
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
      const { error } = await supabase.from('outbound_webhooks').insert({
        organization_id: currentOrg.id,
        name: name.trim(),
        url: url.trim(),
        events: ['*'],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_webhooks'] });
      setCreateOpen(false);
      setName('');
      setUrl('');
      toast.success('Webhook criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testWebhook = async (id: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) {
      toast.error('Sessão inválida');
      return;
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/test-webhook`, {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">
              URLs, teste de ligação e histórico de falhas definitivas
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
              hooks.map((h: any) => (
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
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => testWebhook(h.id)}>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Testar
                    </Button>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        )}

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
                    {logs.map((log: any) => (
                      <tr key={log.id} className="border-t">
                        <td className="p-2 whitespace-nowrap text-xs">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-2 text-xs">{log.event_name ?? '—'}</td>
                        <td className="p-2 text-xs">{log.http_status ?? '—'}</td>
                        <td className="p-2 text-xs text-destructive max-w-md truncate" title={log.error_excerpt}>
                          {log.error_excerpt ?? '—'}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo webhook de saída</DialogTitle>
            <DialogDescription>
              O segredo para assinatura HMAC é gerado automaticamente. Guarde-o se integrar manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM principal" />
            </div>
            <div className="space-y-2">
              <Label>URL HTTPS</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.exemplo.com/webhooks/plataforma" />
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
    </div>
  );
};

export default WebhooksPage;
