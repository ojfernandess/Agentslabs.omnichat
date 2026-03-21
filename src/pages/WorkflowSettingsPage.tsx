import React, { useEffect, useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';

const defaultTransitions = `{
  "allowed_status_changes": [
    ["open", "pending"],
    ["open", "resolved"],
    ["pending", "open"],
    ["snoozed", "open"]
  ],
  "notes": "Personalize transições permitidas para a sua operação."
}`;

const WorkflowSettingsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [notes, setNotes] = useState('');
  const [transitions, setTransitions] = useState(defaultTransitions);

  const { data: row } = useQuery({
    queryKey: ['workflow-settings', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data, error } = await supabase
        .from('workflow_settings')
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
      setNotes(row.notes ?? '');
      setTransitions(JSON.stringify(row.transitions ?? {}, null, 2));
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(transitions);
      } catch {
        throw new Error('JSON de transições inválido');
      }
      const { error } = await supabase.from('workflow_settings').upsert(
        {
          organization_id: currentOrg.id,
          notes: notes.trim() || null,
          transitions: parsed,
        },
        { onConflict: 'organization_id' }
      );
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'workflow.update',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-settings'] });
      toast.success('Fluxo guardado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-7 w-7" />
            Fluxo de conversas
          </h1>
          <p className="text-sm text-muted-foreground">
            Documentação interna e mapa de transições (JSON). Os estados reais continuam a ser o enum
            da base de dados.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Notas internas</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-2">
          <Label>Transições / regras (JSON)</Label>
          <Textarea
            rows={16}
            className="font-mono text-xs"
            value={transitions}
            onChange={(e) => setTransitions(e.target.value)}
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
  );
};

export default WorkflowSettingsPage;
