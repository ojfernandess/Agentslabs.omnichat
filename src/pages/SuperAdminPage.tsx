import React, { useState } from 'react';
import { useNavigate, Routes, Route, NavLink } from 'react-router-dom';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  Key,
  Building2,
  Webhook,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  Shield,
  BookOpen,
} from 'lucide-react';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/super-admin', end: true, icon: LayoutDashboard, label: 'Painel' },
  { to: '/super-admin/users', end: false, icon: Users, label: 'Super Admins' },
  { to: '/super-admin/platform-apps', end: false, icon: Key, label: 'Platform Apps' },
  { to: '/super-admin/organizations', end: false, icon: Building2, label: 'Organizações' },
  { to: '/super-admin/webhooks', end: false, icon: Webhook, label: 'Webhooks e filas' },
];

function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="w-56 border-r bg-card shrink-0 flex flex-col">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => navigate('/inbox')} className="w-full justify-start">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
        <nav className="p-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              <ChevronRight className="h-3 w-3 ml-auto opacity-50" />
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}

function DashboardTab() {
  const { data: stats = {} } = useQuery({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      const [orgs, members, convos, channels, webhookPending] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('organization_members').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('channels').select('id', { count: 'exact', head: true }),
        supabase.from('webhook_outbound_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      return {
        organizations: orgs.count ?? 0,
        members: members.count ?? 0,
        conversations: convos.count ?? 0,
        channels: channels.count ?? 0,
        webhookPending: webhookPending.count ?? 0,
      };
    },
  });

  const cards = [
    { label: 'Organizações', value: stats.organizations ?? 0, icon: Building2 },
    { label: 'Membros', value: stats.members ?? 0, icon: Users },
    { label: 'Conversas', value: stats.conversations ?? 0, icon: Shield },
    { label: 'Canais', value: stats.channels ?? 0, icon: Webhook },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Painel</h1>
        <p className="text-muted-foreground mt-1">Visão geral da instalação (estilo Chatwoot)</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <c.icon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {(stats.webhookPending ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">
            {stats.webhookPending} evento(s) pendente(s) na fila de webhooks
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Ver secção Webhooks e filas para detalhes
          </p>
        </div>
      )}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Recursos do console</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong>Super Admins</strong> — adicionar ou remover privilegiados</li>
          <li>• <strong>Platform Apps</strong> — criar tokens de API para integrações externas</li>
          <li>• <strong>Organizações</strong> — listar e inspecionar organizações</li>
          <li>• <strong>Webhooks e filas</strong> — monitorizar entregas e filas</li>
        </ul>
      </div>
    </div>
  );
}

function SuperAdminsTab() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: superAdmins = [] } = useQuery({
    queryKey: ['super-admins-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('super_admins').select('user_id, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      return data as { user_id: string; created_at: string }[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('super_admins').insert({ user_id: userId.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admins-list'] });
      setAddOpen(false);
      setNewUserId('');
      toast.success('Super admin adicionado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('super_admins').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admins-list'] });
      setDeleteId(null);
      toast.success('Super admin removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="text-muted-foreground mt-1">Utilizadores com acesso ao console de administração</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {superAdmins.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum super admin além de si. Adicione por user_id (UUID).
          </div>
        ) : (
          superAdmins.map((row) => (
            <div key={row.user_id} className="flex items-center justify-between p-4">
              <code className="text-sm font-mono">{row.user_id}</code>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString('pt-BR')}
                </span>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.user_id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Super Admin</DialogTitle>
            <DialogDescription>
              Introduza o user_id (UUID) do utilizador a promover. Obtém-se em auth.users ou no painel Supabase.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="ex: 90f6f092-ef66-4b08-81f5-8c864ac734c4"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="font-mono"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => addMutation.mutate(newUserId)}
              disabled={!newUserId.trim() || addMutation.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Super Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              O utilizador perderá acesso ao console. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlatformAppsTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, '') + '/functions/v1/platform-api';

  const { data: apps = [] } = useQuery({
    queryKey: ['platform-apps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_apps').select('id, name, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; created_at: string }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('platform_apps')
        .insert({ name: newName.trim() })
        .select('id, access_token')
        .single();
      if (error) throw error;
      return data as { id: string; access_token: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['platform-apps'] });
      setCreatedToken(data.access_token);
      setNewName('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyToken = async (token: string, id: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Token copiado');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Apps</h1>
          <p className="text-muted-foreground mt-1">
            Tokens de API para integrações externas (estilo Chatwoot Platform APIs)
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setCreatedToken(null); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Platform App
        </Button>
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {apps.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma Platform App. Crie uma para obter um access_token para a API.
          </div>
        ) : (
          apps.map((app) => (
            <div key={app.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{app.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(app.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <p className="text-xs text-muted-foreground">Token gerado no momento da criação</p>
            </div>
          ))
        )}
      </div>

      <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Documentação Platform API
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border bg-muted/50 p-4 mt-2 space-y-3 text-sm font-mono">
            <p className="text-muted-foreground">
              API compatível com <a href="https://github.com/chatwoot/chatwoot/wiki/Building-on-Top-of-Chatwoot:-Platform-APIs" target="_blank" rel="noreferrer" className="text-primary underline">Chatwoot Platform APIs</a>.
              Use o header <code>api_access_token</code> com o token da Platform App.
            </p>
            <p><strong>Base URL:</strong> {baseUrl || '(defina VITE_SUPABASE_URL)'}</p>
            <div className="space-y-2">
              <p><strong>1. Criar Account (organização):</strong></p>
              <pre className="bg-background p-2 rounded text-xs overflow-x-auto">{`curl -X POST ${baseUrl}/platform/api/v1/accounts \\
  -H "api_access_token: SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Minha Empresa", "locale": "pt"}'`}</pre>
              <p><strong>2. Criar User:</strong></p>
              <pre className="bg-background p-2 rounded text-xs overflow-x-auto">{`curl -X POST ${baseUrl}/platform/api/v1/users \\
  -H "api_access_token: SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "agente@exemplo.com", "password": "Senha123!", "name": "João"}'`}</pre>
              <p><strong>3. Associar User à Account (role: administrator | agent):</strong></p>
              <pre className="bg-background p-2 rounded text-xs overflow-x-auto">{`curl -X POST ${baseUrl}/platform/api/v1/accounts/{ACCOUNT_ID}/account_users \\
  -H "api_access_token: SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "USER_UUID", "role": "administrator"}'`}</pre>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreatedToken(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdToken ? 'Token criado' : 'Nova Platform App'}</DialogTitle>
            <DialogDescription>
              {createdToken
                ? 'Copie o token agora. Não voltará a ser exibido.'
                : 'Nome para identificar a aplicação externa.'}
            </DialogDescription>
          </DialogHeader>
          {createdToken ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly className="font-mono text-xs" value={createdToken} />
                <Button variant="outline" size="icon" onClick={() => copyToken(createdToken, 'new')}>
                  {copiedId === 'new' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={() => { setCreateOpen(false); setCreatedToken(null); }}>Concluir</Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Nome da app (ex: n8n, Zapier)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!newName.trim() || createMutation.isPending}>
                  Criar e gerar token
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrganizationsTab() {
  const { data: orgs = [] } = useQuery({
    queryKey: ['super-admin-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, plan, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; slug: string; plan: string; created_at: string }[];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ['super-admin-org-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('organization_members').select('organization_id');
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { organization_id: string }) => {
        map[r.organization_id] = (map[r.organization_id] ?? 0) + 1;
      });
      return map;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizações</h1>
        <p className="text-muted-foreground mt-1">Todas as organizações da instalação</p>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-4 font-medium">Nome</th>
              <th className="text-left p-4 font-medium">Slug</th>
              <th className="text-left p-4 font-medium">Membros</th>
              <th className="text-left p-4 font-medium">Criada</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-4 font-medium">{org.name}</td>
                <td className="p-4 text-muted-foreground">{org.slug}</td>
                <td className="p-4">{counts?.[org.id] ?? '—'}</td>
                <td className="p-4 text-muted-foreground text-sm">{new Date(org.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WebhooksTab() {
  const { data: queue = [] } = useQuery({
    queryKey: ['super-admin-webhook-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_outbound_queue')
        .select('id, event_name, status, attempts, last_http_status, created_at')
        .in('status', ['pending', 'dead'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data ?? []) as { id: string; event_name: string; status: string; attempts: number; last_http_status: number | null; created_at: string }[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks e filas</h1>
        <p className="text-muted-foreground mt-1">
          Fila de entrega de webhooks de saída (eventos pendentes e falhados)
        </p>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-4 font-medium">Evento</th>
              <th className="text-left p-4 font-medium">Estado</th>
              <th className="text-left p-4 font-medium">Tentativas</th>
              <th className="text-left p-4 font-medium">HTTP</th>
              <th className="text-left p-4 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Nenhum evento pendente ou morto
                </td>
              </tr>
            ) : (
              queue.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-4 font-mono text-sm">{row.event_name}</td>
                  <td className="p-4">
                    <span className={row.status === 'dead' ? 'text-destructive' : 'text-amber-600'}>{row.status}</span>
                  </td>
                  <td className="p-4">{row.attempts}</td>
                  <td className="p-4">{row.last_http_status ?? '—'}</td>
                  <td className="p-4 text-muted-foreground text-sm">{new Date(row.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Nota: webhook_outbound_queue pode ter RLS que impede leitura direta. Se a tabela estiver vazia ou der erro, configure políticas para super admins.
      </p>
    </div>
  );
}

const SuperAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas Super Admins podem aceder a esta página.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/inbox')}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SuperAdminLayout>
      <Routes>
        <Route index element={<DashboardTab />} />
        <Route path="users" element={<SuperAdminsTab />} />
        <Route path="platform-apps" element={<PlatformAppsTab />} />
        <Route path="organizations" element={<OrganizationsTab />} />
        <Route path="webhooks" element={<WebhooksTab />} />
      </Routes>
    </SuperAdminLayout>
  );
};

export default SuperAdminPage;
