import React from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Users, Clock, CheckCircle2, TrendingUp, ArrowUpRight, Inbox } from 'lucide-react';

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-8 max-w-6xl">
        <div className="space-y-1 animate-fade-in">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do atendimento de {currentOrg?.name}</p>
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
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">Nenhuma atividade recente</p>
            <p className="text-xs mt-1">As conversas e interações aparecerão aqui</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
