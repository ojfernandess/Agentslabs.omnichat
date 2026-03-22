import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'macros'>;
type Action = { type: string; [k: string]: unknown };

const MACRO_ACTION_TYPES = [
  { id: 'assign_agent', label: 'Assign agent', params: [{ key: 'assignee_id', label: 'Agent ID' }] },
  { id: 'assign_team', label: 'Assign team', params: [{ key: 'team_id', label: 'Team ID' }] },
  { id: 'add_label', label: 'Add label', params: [{ key: 'label_name', label: 'Label' }] },
  { id: 'remove_label', label: 'Remove label', params: [{ key: 'label_name', label: 'Label' }] },
  { id: 'send_message', label: 'Send message', params: [{ key: 'message', label: 'Message' }] },
  { id: 'set_status', label: 'Set status', params: [{ key: 'status', label: 'Status' }] },
  { id: 'snooze', label: 'Snooze', params: [{ key: 'snooze_until', label: 'Until (ISO)' }] },
  { id: 'send_transcript', label: 'Send transcript', params: [] },
  { id: 'mute', label: 'Mute', params: [] },
] as const;

const defaultActions: Action[] = [{ type: 'add_label', label_name: 'suporte' }];

const MacrosPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    visibility: 'public' as 'private' | 'public',
    actions: defaultActions as Action[],
  });

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

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      visibility: 'public',
      actions: [...defaultActions],
    });
    setOpen(true);
  };

  const openEdit = (r: Row) => {
    const a = Array.isArray(r.actions) ? (r.actions as Action[]) : defaultActions;
    setEditingId(r.id);
    setForm({
      name: r.name,
      visibility: (r as Row & { visibility?: string }).visibility === 'private' ? 'private' : 'public',
      actions: a.length > 0 ? a : [...defaultActions],
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !currentMember) return;
      const payload = {
        organization_id: currentOrg.id,
        name: form.name.trim(),
        visibility: form.visibility,
        created_by: currentMember?.user_id ?? null,
        actions: form.actions,
      };
      if (editingId) {
        const { error } = await supabase
          .from('macros')
          .update({ name: payload.name, visibility: payload.visibility, actions: payload.actions })
          .eq('id', editingId);
        if (error) throw error;
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'macro.update',
          entityId: editingId,
        });
      } else {
        const { data, error } = await supabase
          .from('macros')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'macro.create',
          entityId: data.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] });
      setOpen(false);
      setEditingId(null);
      toast.success(editingId ? 'Macro atualizada' : 'Macro criada');
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

  const addAction = () => {
    setForm({ ...form, actions: [...form.actions, { type: 'add_label', label_name: '' }] });
  };

  const removeAction = (idx: number) => {
    const a = form.actions.filter((_, i) => i !== idx);
    if (a.length < 1) return;
    setForm({ ...form, actions: a });
  };

  const updateAction = (idx: number, updates: Partial<Action>) => {
    const a = [...form.actions];
    a[idx] = { ...a[idx], ...updates };
    setForm({ ...form, actions: a });
  };

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
              Sequências de acções (Chatwoot): atribuir agente, etiquetas, enviar mensagem, etc.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova macro
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? 'Editar macro' : 'Nova macro'}</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Visibilidade</Label>
                    <Select
                      value={form.visibility}
                      onValueChange={(v) =>
                        setForm({ ...form, visibility: v as 'private' | 'public' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Público (toda a equipa)</SelectItem>
                        <SelectItem value="private">Privado (só eu)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Acções</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addAction}>
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.actions.map((act, idx) => {
                        const def = MACRO_ACTION_TYPES.find((a) => a.id === act.type);
                        return (
                          <div key={idx} className="flex flex-wrap gap-2 items-center p-2 rounded border bg-muted/30">
                            <Select
                              value={act.type}
                              onValueChange={(v) => updateAction(idx, { type: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MACRO_ACTION_TYPES.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {def?.params.map((p) => (
                              <Input
                                key={p.key}
                                className="flex-1 min-w-[120px]"
                                value={String(act[p.key] ?? '')}
                                onChange={(e) => updateAction(idx, { [p.key]: e.target.value })}
                                placeholder={p.label}
                              />
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeAction(idx)}
                              disabled={form.actions.length <= 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
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
              <div className="flex justify-between gap-2 items-center">
                <div>
                  <span className="font-medium">{r.name}</span>
                  {(r as Row & { visibility?: string }).visibility === 'private' && (
                    <span className="ml-2 text-xs text-muted-foreground">(privado)</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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
