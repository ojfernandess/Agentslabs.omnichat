import React from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

const AuditLogPage: React.FC = () => {
  const { currentOrg } = useOrg();

  const { data: rows = [] } = useQuery({
    queryKey: ['audit-logs', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('organization_audit_logs')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-4 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7" />
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Últimos eventos administrativos registados na organização.
          </p>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Quando</th>
                <th className="p-2">Acção</th>
                <th className="p-2">Entidade</th>
                <th className="p-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-2 font-mono text-xs">{r.action}</td>
                  <td className="p-2 text-xs">
                    {r.entity_type ?? '—'} {r.entity_id ? r.entity_id.slice(0, 8) + '…' : ''}
                  </td>
                  <td className="p-2 text-xs max-w-[240px] truncate">
                    {JSON.stringify(r.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem registos ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogPage;
