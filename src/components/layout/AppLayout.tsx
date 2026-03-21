import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import {
  MessageSquare, LayoutDashboard, Users, BookUser, Settings,
  Hash, LogOut, ChevronDown, Inbox, Tag
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/conversations', icon: Inbox, label: 'Conversas' },
  { to: '/contacts', icon: BookUser, label: 'Contatos' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/channels', icon: Hash, label: 'Canais' },
  { to: '/labels', icon: Tag, label: 'Etiquetas' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { signOut, user } = useAuth();
  const { currentOrg, organizations, setCurrentOrg } = useOrg();
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-16 lg:w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0">
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 px-3 lg:px-5 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shrink-0">
            <MessageSquare className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="hidden lg:block text-base font-semibold text-sidebar-foreground">OmniChat</span>
        </div>

        {/* Org Switcher */}
        {currentOrg && (
          <div className="px-3 lg:px-4 py-3 border-b border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground shrink-0">
                  {currentOrg.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:block truncate text-left text-sidebar-foreground flex-1">{currentOrg.name}</span>
                <ChevronDown className="hidden lg:block h-3.5 w-3.5 text-sidebar-muted shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {organizations.map(org => (
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2 lg:px-3 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-sidebar-border px-2 lg:px-3 py-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden lg:block">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
