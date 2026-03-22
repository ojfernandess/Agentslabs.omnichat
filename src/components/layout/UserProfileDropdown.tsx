import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  User,
  LogOut,
  Keyboard,
  Palette,
  BookOpen,
  FileText,
  Castle,
  Info,
  Circle,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const DOCS_URL = 'https://www.chatwoot.com/docs';
const APP_VERSION = '1.0.0';

const statusOptions = [
  { value: 'online', label: 'Online', color: 'bg-emerald-500' },
  { value: 'busy', label: 'Ocupado', color: 'bg-amber-500' },
  { value: 'offline', label: 'Offline', color: 'bg-muted-foreground' },
];

const keyboardShortcuts = [
  { keys: ['Ctrl', 'Enter'], desc: 'Enviar mensagem' },
  { keys: ['Ctrl', 'K'], desc: 'Buscar conversas' },
  { keys: ['Ctrl', 'N'], desc: 'Nova conversa' },
];

type UserProfileDropdownProps = {
  displayName: string;
  email: string;
  initials: string;
  isSuperAdmin?: boolean;
};

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  displayName,
  email,
  initials,
  isSuperAdmin = false,
}) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { currentMember, refetch: refetchOrg } = useOrg();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);

  const memberId = currentMember?.id;

  const { data: memberData } = useQuery({
    queryKey: ['org-member-profile', memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data, error } = await supabase
        .from('organization_members')
        .select('status, auto_offline')
        .eq('id', memberId)
        .single();
      if (error) throw error;
      return data as { status: string | null; auto_offline: boolean | null };
    },
    enabled: !!memberId,
  });

  const updateMember = useMutation({
    mutationFn: async ({
      status,
      auto_offline,
    }: {
      status?: string;
      auto_offline?: boolean;
    }) => {
      if (!memberId) throw new Error('Sem membro');
      const { error } = await supabase
        .from('organization_members')
        .update(
          Object.fromEntries(
            Object.entries({ status, auto_offline }).filter(([, v]) => v !== undefined)
          ) as Record<string, unknown>
        )
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-member-profile', memberId] });
      void refetchOrg();
    },
  });

  const status = memberData?.status ?? 'offline';
  const autoOffline = memberData?.auto_offline ?? true;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors text-left min-w-0"
          >
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
                {initials}
              </div>
              <span
                className={cn(
                  'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar',
                  statusOptions.find((s) => s.value === status)?.color ?? 'bg-muted-foreground'
                )}
                title={statusOptions.find((s) => s.value === status)?.label ?? 'Offline'}
              />
            </div>
            <div className="hidden lg:block min-w-0 flex-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                {displayName}
              </p>
              <p className="text-[11px] text-sidebar-muted truncate">{email}</p>
            </div>
            <ChevronDown className="hidden lg:block h-3.5 w-3.5 text-sidebar-muted shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" side="top">
          {/* Disponibilidade */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1 text-sm font-medium">Disponibilidade</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Circle
                  className={cn(
                    'h-2 w-2 rounded-full fill-current',
                    statusOptions.find((s) => s.value === status)?.color
                  )}
                />
                {statusOptions.find((s) => s.value === status)?.label ?? 'Offline'}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {statusOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => updateMember.mutate({ status: opt.value })}
                >
                  <span className={cn('mr-2 h-2 w-2 rounded-full', opt.color)} />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Marcar offline automaticamente */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Label htmlFor="auto-offline" className="text-sm cursor-pointer">
                Marcar offline automaticamente
              </Label>
            </div>
            <Switch
              id="auto-offline"
              checked={autoOffline}
              onCheckedChange={(v) => updateMember.mutate({ auto_offline: v })}
            />
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4 mr-2" />
            Atalhos do teclado
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
            <User className="h-4 w-4 mr-2" />
            Configurações do perfil
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="h-4 w-4 mr-2" />
              Alterar tema ({theme === 'dark' ? 'Escuro' : theme === 'light' ? 'Claro' : 'Sistema'})
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setTheme('light')}>Claro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>Escuro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>Sistema</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem asChild>
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              <BookOpen className="h-4 w-4 mr-2" />
              Ler documentação
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setVersionOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Notas de versão
          </DropdownMenuItem>
          {isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/super-admin')}>
                <Castle className="h-4 w-4 mr-2" />
                Console de Super Admin
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            Encerrar sessão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Atalhos do teclado */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atalhos do teclado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {keyboardShortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{s.desc}</span>
                <kbd className="flex gap-1">
                  {s.keys.map((k) => (
                    <span
                      key={k}
                      className="rounded border bg-muted px-2 py-0.5 text-xs font-mono"
                    >
                      {k}
                    </span>
                  ))}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Notas de versão */}
      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notas de versão</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">v{APP_VERSION}</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Disponibilidade (Online, Ocupado, Offline)</li>
              <li>Marcar offline automaticamente</li>
              <li>Alterar tema (claro/escuro/sistema)</li>
              <li>Console de Super Admin</li>
              <li>Avisos sonoros configuráveis</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserProfileDropdown;
