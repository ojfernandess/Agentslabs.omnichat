import React, { useEffect, useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';

const SecuritySettingsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [require2fa, setRequire2fa] = useState(false);
  const [cidrText, setCidrText] = useState('');
  const [sessionMin, setSessionMin] = useState<string>('');

  const { data: row } = useQuery({
    queryKey: ['security-settings', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data, error } = await supabase
        .from('security_settings')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrg,
  });

  useEffect(() => {
    if (row) {
      setRequire2fa(row.require_2fa_for_admins);
      setCidrText((row.allowed_ip_cidrs ?? []).join('\n'));
      setSessionMin(row.session_timeout_minutes != null ? String(row.session_timeout_minutes) : '');
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const allowed_ip_cidrs = cidrText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const session_timeout_minutes = sessionMin.trim() ? parseInt(sessionMin, 10) : null;
      const { error } = await supabase.from('security_settings').upsert(
        {
          organization_id: currentOrg.id,
          require_2fa_for_admins: require2fa,
          allowed_ip_cidrs,
          session_timeout_minutes:
            session_timeout_minutes != null && !Number.isNaN(session_timeout_minutes)
              ? session_timeout_minutes
              : null,
        },
        { onConflict: 'organization_id' }
      );
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'security.update',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-settings'] });
      toast.success('Políticas de segurança guardadas');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="h-7 w-7" />
            Segurança
          </h1>
          <p className="text-sm text-muted-foreground">
            Preferências de política. A imposição de IP/2FA no login requer integração com o vosso
            IdP ou Edge Functions.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Exigir 2FA a administradores</p>
              <p className="text-xs text-muted-foreground">Flag para futura integração</p>
            </div>
            <Switch checked={require2fa} onCheckedChange={setRequire2fa} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label>Lista de IPs / CIDR (um por linha)</Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={cidrText}
              onChange={(e) => setCidrText(e.target.value)}
              disabled={!canEdit}
              placeholder="203.0.113.0/24"
            />
          </div>
          <div className="space-y-1">
            <Label>Timeout de sessão (minutos, opcional)</Label>
            <Input
              type="number"
              min={5}
              value={sessionMin}
              onChange={(e) => setSessionMin(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Guardar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecuritySettingsPage;
