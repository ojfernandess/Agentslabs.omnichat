import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useSelectedConversation } from '@/contexts/SelectedConversationContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Users, Clock, CheckCircle2, TrendingUp, ArrowUpRight, Inbox, User, ArrowRight } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/chatwootConversation';

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  telegram: 'Telegram',
  email: 'E-mail',
  livechat: 'Live Chat',
  sms: 'SMS',
};

const channelColors: Record<string, string> = {
  whatsapp: 'channel-whatsapp',
  messenger: 'channel-messenger',
  instagram: 'channel-instagram',
  telegram: 'channel-telegram',
  email: 'channel-email',
  livechat: 'channel-livechat',
  sms: 'channel-sms',
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
}> = ({ label, value, icon, trend }) => (
  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {trend && (
          <p className="flex items-center gap-1 text-xs text-accent">
            <ArrowUpRight className="h-3 w-3" />
            {trend}
          </p>
        )}
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
    </div>
  </div>
);

const DashboardPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setSelectedConversationId } = useSelectedConversation();
  const isInbox = location.pathname === '/inbox';
  const { currentOrg } = useOrg();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;

      const [convos, contacts, members, openConvos] = await Promise.all([
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', currentOrg.id),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', currentOrg.id),
        supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', currentOrg.id),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', currentOrg.id).eq('status', 'open'),
      ]);

      return {
        totalConversations: convos.count ?? 0,
        totalContacts: contacts.count ?? 0,
        totalMembers: members.count ?? 0,
        openConversations: openConvos.count ?? 0,
      };
    },
    enabled: !!currentOrg,
  });

  const { data: recentConversations = [] } = useQuery({
    queryKey: ['dashboard-recent-conversations', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id, status, last_message_at, unread_count,
          contacts(name, avatar_url),
          channels(name, channel_type),
          assignee:organization_members!conversations_assignee_id_fkey(display_name)
        `)
        .eq('organization_id', currentOrg.id)
        .order('last_message_at', { ascending: false })
        .limit(10);
      if (error) {
        const { data: fallback } = await supabase
          .from('conversations')
          .select('id, status, last_message_at, unread_count, contacts(name, avatar_url), channels(name, channel_type)')
          .eq('organization_id', currentOrg.id)
          .order('last_message_at', { ascending: false })
          .limit(10);
        return fallback ?? [];
      }
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const openConversation = (convoId: string) => {
    setSelectedConversationId(convoId);
    navigate('/conversations');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-8 max-w-6xl">
        <div className="space-y-1 animate-fade-in">
          <h1 className="text-2xl font-bold">{isInbox ? 'Caixa de entrada' : 'Dashboard'}</h1>
          <p className="text-muted-foreground">
            {isInbox
              ? `Resumo da caixa e métricas de ${currentOrg?.name}`
              : `Visão geral do atendimento de ${currentOrg?.name}`}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <StatCard
            label="Conversas abertas"
            value={stats?.openConversations ?? 0}
            icon={<Inbox className="h-5 w-5" />}
          />
          <StatCard
            label="Total de conversas"
            value={stats?.totalConversations ?? 0}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            label="Contatos"
            value={stats?.totalContacts ?? 0}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            label="Agentes"
            value={stats?.totalMembers ?? 0}
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        </div>

        <div className="rounded-xl border bg-card p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-semibold mb-4">Atividade recente</h2>
          {recentConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma atividade recente</p>
              <p className="text-xs mt-1">As conversas e interações aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentConversations.map((convo: any) => (
                <button
                  key={convo.id}
                  type="button"
                  onClick={() => openConversation(convo.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                    (convo.unread_count ?? 0) > 0 ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium overflow-hidden">
                    {convo.contacts?.avatar_url ? (
                      <img src={convo.contacts.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      convo.contacts?.name?.charAt(0)?.toUpperCase() ?? <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {convo.contacts?.name || `Conversa #${convo.id.slice(0, 8)}`}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {convo.channels && (
                        <span className={`channel-badge text-[10px] px-1.5 py-0.5 rounded truncate max-w-[140px] ${channelColors[convo.channels.channel_type] ?? ''}`} title={convo.channels.name ? `Inbox: ${convo.channels.name}` : `Inbox: ${channelLabels[convo.channels.channel_type] || convo.channels.channel_type}`}>
                          {convo.channels.name || channelLabels[convo.channels.channel_type] || convo.channels.channel_type}
                        </span>
                      )}
                      <span>{STATUS_LABELS[convo.status] ?? convo.status}</span>
                      {convo.last_message_at && (
                        <span>• {new Date(convo.last_message_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>
                  {(convo.unread_count ?? 0) > 0 && (
                    <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {convo.unread_count}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => navigate('/conversations')}
                className="w-full py-2 text-sm text-primary hover:underline mt-2"
              >
                Ver todas as conversas →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
