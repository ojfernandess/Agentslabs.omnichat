import React, { useMemo } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_PERMISSION_KEYS } from '@/lib/orgPermissionKeys';
import type { Database } from '@/integrations/supabase/types';

type OrgRole = Database['public']['Enums']['org_role'];
const ROLES: OrgRole[] = ['owner', 'admin', 'supervisor', 'agent'];

const RolePermissionsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);

  const { data: rows = [] } = useQuery({
    queryKey: ['role-permissions', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('organization_id', currentOrg.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, boolean>> = {};
    const ids: Record<string, Record<string, string | undefined>> = {};
    for (const r of ROLES) {
      m[r] = {};
      ids[r] = {};
      for (const p of ORG_PERMISSION_KEYS) {
        const row = rows.find((x) => x.role === r && x.permission_key === p.key);
        m[r]![p.key] = row ? row.allowed : true;
        ids[r]![p.key] = row?.id;
      }
    }
    return { m, ids };
  }, [rows]);

  const setPermission = useMutation({
    mutationFn: async (payload: {
      role: OrgRole;
      permission_key: string;
      allowed: boolean;
      existingId?: string;
    }) => {
      if (!currentOrg) return;
      if (payload.existingId) {
        const { error } = await supabase
          .from('role_permissions')
          .update({ allowed: payload.allowed })
          .eq('id', payload.existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('role_permissions').insert({
          organization_id: currentOrg.id,
          role: payload.role,
          permission_key: payload.permission_key,
          allowed: payload.allowed,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" />
            Funções personalizadas
          </h1>
          <p className="text-sm text-muted-foreground">
            Permissões por função (predefinição: permitido). A aplicação pode ler estas flags nas
            rotas sensíveis.
          </p>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-2 text-left">Permissão</th>
                {ROLES.map((r) => (
                  <th key={r} className="p-2 text-center capitalize">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORG_PERMISSION_KEYS.map((p) => (
                <tr key={p.key} className="border-b border-border/60">
                  <td className="p-2">
                    <span className="font-medium">{p.label}</span>
                    <code className="ml-2 text-[10px] text-muted-foreground">{p.key}</code>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="p-2 text-center">
                      <Switch
                        disabled={!canEdit || r === 'owner'}
                        checked={matrix.m[r]?.[p.key] ?? true}
                        onCheckedChange={(v) =>
                          setPermission.mutate({
                            role: r,
                            permission_key: p.key,
                            allowed: v,
                            existingId: matrix.ids[r]?.[p.key],
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <p className="text-xs text-muted-foreground">
            As alterações guardam-se ao alternar cada interruptor.
          </p>
        )}
      </div>
    </div>
  );
};

export default RolePermissionsPage;
