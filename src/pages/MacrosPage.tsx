import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'macros'>;

const defaultActions =
  '[\n  { "type": "add_label", "label_name": "suporte" },\n  { "type": "set_priority", "priority": "high" }\n]';

const MacrosPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', actions: defaultActions });

  const { data: rows = [] } = useQuery({
    queryKey: ['macros', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      let actions: unknown;
      try {
        actions = JSON.parse(form.actions);
      } catch {
        throw new Error('JSON de acções inválido');
      }
      const { data, error } = await supabase
        .from('macros')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          actions,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'macro.create',
        entityId: data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      setOpen(false);
      setForm({ name: '', actions: defaultActions });
      toast.success('Macro criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrg) return;
      const { error } = await supabase.from('macros').delete().eq('id', id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'macro.delete',
        entityId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      toast.success('Removida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-7 w-7" />
              Macros
            </h1>
            <p className="text-sm text-muted-foreground">
              Várias acções numa sequência (etiquetas, prioridade, estado). Integração com o composer
              pode usar estes IDs.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova macro
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nova macro</DialogTitle>
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
                  <div className="space-y-1">
                    <Label>Acções (JSON)</Label>
                    <Textarea
                      rows={12}
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
            <div key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{r.name}</span>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <pre className="text-[10px] mt-2 bg-muted/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(r.actions, null, 2)}
              </pre>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma macro.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MacrosPage;
