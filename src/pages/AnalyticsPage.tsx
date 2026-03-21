import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';
import type { Database } from '@/integrations/supabase/types';
import { isMissingColumnSelectError } from '@/lib/supabaseMissingTable';

type ChannelType = Database['public']['Enums']['channel_type'];

const rangePresets = [
  { id: '7', days: 7, label: 'Últimos 7 dias' },
  { id: '30', days: 30, label: 'Últimos 30 dias' },
  { id: '90', days: 90, label: 'Últimos 90 dias' },
];

const AnalyticsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const allowed =
    currentMember &&
    ['owner', 'admin', 'supervisor'].includes(currentMember.role);
  if (currentMember && !allowed) {
    return <Navigate to="/inbox" replace />;
  }
  const [rangeId, setRangeId] = useState('30');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const days = rangePresets.find((r) => r.id === rangeId)?.days ?? 30;
  const from = useMemo(() => startOfDay(subDays(new Date(), days)), [days]);
  const to = useMemo(() => endOfDay(new Date()), []);

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('channels')
        .select('id, name, channel_type')
        .eq('organization_id', currentOrg.id);
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', currentOrg?.id, from.toISOString(), to.toISOString(), channelFilter],
    queryFn: async () => {
      if (!currentOrg) return null;

      const buildConvQuery = (select: string) => {
        let q = supabase
          .from('conversations')
          .select(select)
          .eq('organization_id', currentOrg.id)
          .gte('created_at', from.toISOString())
          .lte('created_at', to.toISOString());
        if (channelFilter !== 'all') {
          q = q.eq('channel_id', channelFilter);
        }
        return q;
      };

      const fullSelect =
        'id, created_at, first_reply_at, channel_id, satisfaction_score, channels(name, channel_type)';
      const fallbackSelect = 'id, created_at, first_reply_at, channel_id, channels(name, channel_type)';

      let { data: convos, error } = await buildConvQuery(fullSelect);
      let hasSatisfactionColumn = true;
      if (error && isMissingColumnSelectError(error)) {
        const retry = await buildConvQuery(fallbackSelect);
        if (retry.error) throw retry.error;
        convos = retry.data;
        hasSatisfactionColumn = false;
      } else if (error) {
        throw error;
      }

      const rows = convos ?? [];

      const volumeByDay = new Map<string, number>();
      const byChannel = new Map<string, { name: string; type: ChannelType; count: number; satSum: number; satN: number }>();

      let replySeconds: number[] = [];
      for (const c of rows as any[]) {
        const day = c.created_at?.slice(0, 10) ?? '';
        volumeByDay.set(day, (volumeByDay.get(day) ?? 0) + 1);

        const ch = c.channels;
        const key = c.channel_id ?? 'none';
        const name = ch?.name ?? 'Sem canal';
        const type = (ch?.channel_type ?? 'api') as ChannelType;
        const cur = byChannel.get(key) ?? { name, type, count: 0, satSum: 0, satN: 0 };
        cur.count += 1;
        if (typeof c.satisfaction_score === 'number') {
          cur.satSum += c.satisfaction_score;
          cur.satN += 1;
        }
        byChannel.set(key, cur);

        if (c.first_reply_at && c.created_at) {
          const a = new Date(c.first_reply_at).getTime();
          const b = new Date(c.created_at).getTime();
          const sec = (a - b) / 1000;
          if (sec >= 0 && sec < 864000) replySeconds.push(sec);
        }
      }

      const volumeChart = [...volumeByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      const channelChart = [...byChannel.values()].map((c) => ({
        name: c.name,
        conversas: c.count,
        satisfacao: c.satN ? Math.round((c.satSum / c.satN) * 10) / 10 : null,
      }));

      const avgReplySec =
        replySeconds.length > 0
          ? replySeconds.reduce((a, b) => a + b, 0) / replySeconds.length
          : null;

      const satAll = rows.filter((r: any) => typeof r.satisfaction_score === 'number');
      const avgSat =
        satAll.length > 0
          ? satAll.reduce((s: number, r: any) => s + r.satisfaction_score, 0) / satAll.length
          : null;

      return {
        total: rows.length,
        avgReplyMinutes: avgReplySec != null ? avgReplySec / 60 : null,
        avgSatisfaction: avgSat,
        volumeChart,
        channelChart,
        hasSatisfactionColumn,
      };
    },
    enabled: !!currentOrg,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Analytics de conversas</h1>
          <p className="text-muted-foreground text-sm">
            Volume, tempo médio até a primeira resposta e satisfação por canal
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={rangeId} onValueChange={setRangeId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rangePresets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {channels.map((c: { id: string; name: string }) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">A carregar métricas…</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Conversas no período</CardDescription>
                  <CardTitle className="text-3xl">{analytics?.total ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Tempo médio até 1.ª resposta</CardDescription>
                  <CardTitle className="text-3xl">
                    {analytics?.avgReplyMinutes != null
                      ? `${analytics.avgReplyMinutes.toFixed(1)} min`
                      : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Com base em conversas com `first_reply_at` preenchido
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Satisfação média (1–5)</CardDescription>
                  <CardTitle className="text-3xl">
                    {analytics?.avgSatisfaction != null
                      ? analytics.avgSatisfaction.toFixed(2)
                      : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {analytics?.hasSatisfactionColumn === false ? (
                    <span className="text-amber-700 dark:text-amber-500">
                      A coluna satisfaction_score ainda não existe neste projeto. Aplique a migration que adiciona CSAT
                      (ex. 20260321230000) e recarregue.
                    </span>
                  ) : (
                    <>Defina satisfaction_score nas conversas (ou automatize via API)</>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Volume diário</CardTitle>
                <CardDescription>Novas conversas por dia</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.volumeChart ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Por canal</CardTitle>
                <CardDescription>Volume e satisfação média quando existir pontuação</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={analytics?.channelChart ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="conversas" fill="hsl(var(--primary))" name="Conversas" />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="satisfacao"
                      stroke="hsl(var(--chart-2))"
                      name="Satisfação"
                      dot
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
