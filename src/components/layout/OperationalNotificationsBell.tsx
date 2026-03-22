import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOperationalNotifications } from '@/hooks/useOperationalNotifications';
import { useSupervisorBrowserPush } from '@/hooks/useSupervisorBrowserPush';
import { cn } from '@/lib/utils';

type Props = {
  organizationId: string | undefined;
  enabled: boolean;
  inboxUnread?: number;
};

const severityDot: Record<string, string> = {
  error: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

const OperationalNotificationsBell: React.FC<Props> = ({
  organizationId,
  enabled: showOps,
  inboxUnread = 0,
}) => {
  const { items, unreadCount, markRead, markAllRead } = useOperationalNotifications(
    organizationId,
    showOps
  );

  const latest = items[0];
  useSupervisorBrowserPush(
    showOps,
    unreadCount,
    latest?.title ?? 'Alertas operacionais',
    latest?.body ?? undefined
  );

  const totalBadge = showOps ? inboxUnread + unreadCount : inboxUnread;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground animate-pulse">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[min(70vh,420px)] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-medium">Notificações</span>
        </div>
        <DropdownMenuSeparator />
        {inboxUnread > 0 && (
          <>
            <DropdownMenuItem asChild>
              <a href="/conversations" className="flex items-center gap-2 cursor-pointer">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
                <span>{inboxUnread === 1 ? '1 conversa não lida' : `${inboxUnread} conversas não lidas`}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {showOps && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span>Alertas operacionais</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs font-normal text-primary hover:underline"
                  onClick={() => markAllRead()}
                >
                  Marcar todas como lidas
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {showOps && items.length === 0 && inboxUnread === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground text-center">Sem notificações</p>
        ) : showOps && items.length > 0 ? (
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn('flex flex-col items-start gap-1 cursor-pointer', !n.read_at && 'bg-muted/50')}
              onClick={() => !n.read_at && markRead(n.id)}
            >
              <div className="flex items-start gap-2 w-full">
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    severityDot[n.severity] ?? severityDot.info
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </DropdownMenuItem>
          ))
        ) : !showOps && inboxUnread === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground text-center">Sem notificações</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default OperationalNotificationsBell;
