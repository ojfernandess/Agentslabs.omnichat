import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'automation_rules'>;

const defaultTrigger = '{\n  "event": "conversation_created"\n}';
const defaultActions = '[\n  { "type": "set_status", "status": "open" }\n]';

const AutomationRulesPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    enabled: true,
    trigger: defaultTrigger,
    actions: defaultActions,
  });

  const { data: rows = [] } = useQuery({
    queryKey: ['automation-rules', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      let trigger: Record<string, unknown>;
      let actions: unknown;
      try {
        trigger = JSON.parse(form.trigger);
        actions = JSON.parse(form.actions);
      } catch {
        throw new Error('JSON inválido em gatilho ou acções');
      }
      const { data, error } = await supabase
        .from('automation_rules')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          enabled: form.enabled,
          trigger,
          actions,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'automation.create',
        entityId: data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      setOpen(false);
      setForm({ name: '', enabled: true, trigger: defaultTrigger, actions: defaultActions });
      toast.success('Regra criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrg) return;
      const { error } = await supabase.from('automation_rules').delete().eq('id', id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'automation.delete',
        entityId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Removida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase
        .from('automation_rules')
        .update({ enabled: !r.enabled })
        .eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-7 w-7" />
              Automação
            </h1>
            <p className="text-sm text-muted-foreground">
              Regras com gatilho JSON e lista de acções. A execução em tempo real pode ser ligada a
              webhooks ou jobs.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova regra
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nova regra</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label>Nome</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.enabled}
                      onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                    />
                    <span className="text-sm">Activa</span>
                  </div>
                  <div className="space-y-1">
                    <Label>Gatilho (JSON)</Label>
                    <Textarea
                      rows={6}
                      className="font-mono text-xs"
                      value={form.trigger}
                      onChange={(e) => setForm({ ...form, trigger: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Acções (JSON array)</Label>
                    <Textarea
                      rows={8}
                      className="font-mono text-xs"
                      value={form.actions}
                      onChange={(e) => setForm({ ...form, actions: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={save.isPending}>
                    Guardar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="space-y-3">
          {rows.map((r: Row) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.name}</span>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={() => toggleEnabled.mutate(r)}
                    />
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto">
                {JSON.stringify({ trigger: r.trigger, actions: r.actions }, null, 2)}
              </pre>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma regra definida.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutomationRulesPage;
