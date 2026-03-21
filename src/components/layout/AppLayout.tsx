import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Inbox,
  MessageSquare,
  Sparkles,
  BookUser,
  BarChart3,
  Megaphone,
  BookOpen,
  Settings,
  ChevronDown,
  LogOut,
  Users,
  UsersRound,
  Hash,
  Tag,
  Braces,
  Zap,
  Bot,
  Calendar,
  MessageSquareQuote,
  Puzzle,
  ClipboardList,
  Shield,
  Clock,
  GitBranch,
  Building2,
  UserCog,
  Lock,
} from 'lucide-react';
import OperationalNotificationsBell from '@/components/layout/OperationalNotificationsBell';
import { APP_LOGO_SRC, APP_NAME } from '@/constants/branding';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { to: '/inbox', icon: Inbox, label: 'Caixa de entrada', badgeKey: 'inbox' as const },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
  { to: '/captain', icon: Sparkles, label: 'Capitão' },
  { to: '/contacts', icon: BookUser, label: 'Contatos' },
  { to: '/reports', icon: BarChart3, label: 'Relatórios' },
  { to: '/campaigns', icon: Megaphone, label: 'Campanhas' },
  { to: '/help-center', icon: BookOpen, label: 'Central de ajuda' },
];

const settingsNavItems = [
  { to: '/settings/account', icon: Building2, label: 'Conta' },
  { to: '/settings/agents', icon: Users, label: 'Agentes' },
  { to: '/settings/teams', icon: UsersRound, label: 'Times' },
  { to: '/settings/inboxes', icon: Inbox, label: 'Caixas de entrada' },
  { to: '/settings/labels', icon: Tag, label: 'Etiquetas' },
  { to: '/settings/attributes', icon: Braces, label: 'Atributos personalizados' },
  { to: '/settings/automation', icon: Zap, label: 'Automação' },
  { to: '/settings/bots', icon: Bot, label: 'Robôs' },
  { to: '/settings/macros', icon: Calendar, label: 'Macros' },
  { to: '/settings/canned-responses', icon: MessageSquareQuote, label: 'Respostas prontas' },
  { to: '/settings/integrations', icon: Puzzle, label: 'Integrações' },
  { to: '/settings/audit', icon: ClipboardList, label: 'Auditoria' },
  { to: '/settings/roles', icon: UserCog, label: 'Funções personalizadas' },
  { to: '/settings/sla', icon: Clock, label: 'SLA' },
  { to: '/settings/workflow', icon: GitBranch, label: 'Fluxo de conversas' },
  { to: '/settings/security', icon: Lock, label: 'Segurança' },
];

const linkClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-w-0',
    isActive
      ? 'bg-sidebar-accent text-sidebar-foreground'
      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
  );

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { signOut, user } = useAuth();
  const { currentOrg, organizations, setCurrentOrg, currentMember } = useOrg();
  const showOps =
    !!currentMember && ['owner', 'admin', 'supervisor'].includes(currentMember.role);

  const { data: inboxUnread = 0 } = useQuery({
    queryKey: ['inbox-unread-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return 0;
      const { count, error } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', currentOrg.id)
        .gt('unread_count', 0);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!currentOrg,
    refetchInterval: 25_000,
  });

  const displayName =
    currentMember?.display_name?.trim() ||
    (user?.user_metadata?.display_name as string | undefined)?.trim() ||
    user?.email?.split('@')[0] ||
    'Utilizador';

  const email = user?.email ?? '';

  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-16 lg:w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="flex h-14 items-center gap-3 px-3 lg:px-5 border-b border-sidebar-border min-w-0">
          <img
            src={APP_LOGO_SRC}
            alt={APP_NAME}
            className="h-8 w-auto max-w-[min(140px,40vw)] object-contain shrink-0"
          />
          <span
            className="hidden lg:block text-sm font-semibold text-sidebar-foreground leading-tight truncate"
            title={APP_NAME}
          >
            {APP_NAME}
          </span>
        </div>

        {currentOrg && (
          <div className="px-3 lg:px-4 py-3 border-b border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground shrink-0">
                  {currentOrg.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:block truncate text-left text-sidebar-foreground flex-1">
                  {currentOrg.name}
                </span>
                <ChevronDown className="hidden lg:block h-3.5 w-3.5 text-sidebar-muted shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {organizations.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => setCurrentOrg(org)}>
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-bold mr-2">
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    {org.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2 lg:px-3 space-y-0.5">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => linkClass(isActive)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block truncate">{item.label}</span>
              {item.badgeKey === 'inbox' && inboxUnread > 0 && (
                <span className="hidden lg:inline-flex ml-auto min-w-[1.25rem] h-5 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
            </NavLink>
          ))}

          <Collapsible defaultOpen className="pt-2">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted hover:text-sidebar-foreground">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden lg:flex flex-1 text-left">Configurações</span>
              <ChevronDown className="hidden lg:block h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pt-1 pl-0 lg:pl-1">
              {settingsNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn(linkClass(isActive), 'lg:pl-2')}
                  title={item.label}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  <span className="hidden lg:block truncate text-[13px]">{item.label}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {showOps && (
            <>
              <div className="pt-3 pb-1 px-3 hidden lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  Operações
                </p>
              </div>
              <NavLink to="/analytics" className={({ isActive }) => linkClass(isActive)}>
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span className="hidden lg:block truncate">Analytics (avançado)</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border px-2 lg:px-3 py-3 space-y-2">
          <div className="hidden lg:flex items-center gap-2 min-w-0 px-1">
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
                {initials}
              </div>
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar"
                title="Online"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">{displayName}</p>
              <p className="text-[11px] text-sidebar-muted truncate">{email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <OperationalNotificationsBell organizationId={currentOrg?.id} enabled={showOps} />
            <button
              type="button"
              onClick={signOut}
              className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
};

export default AppLayout;
