import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Zap, Plus, Trash2, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'automation_rules'>;

const AUTOMATION_EVENTS = [
  { id: 'conversation_created', label: 'Conversation created' },
  { id: 'conversation_updated', label: 'Conversation updated' },
  { id: 'message_created', label: 'Message created' },
  { id: 'conversation_opened', label: 'Conversation opened' },
] as const;

const CONDITION_OPERATORS = [
  { id: 'equal_to', label: 'Equals' },
  { id: 'not_equal_to', label: 'Not equals' },
  { id: 'contains', label: 'Contains' },
  { id: 'does_not_contain', label: 'Does not contain' },
  { id: 'is_blank', label: 'Is blank' },
  { id: 'is_not_blank', label: 'Is not blank' },
] as const;

const ACTION_TYPES = [
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

type Condition = { attribute: string; operator: string; value: string };
type Action = { type: string; [k: string]: unknown };
type Trigger = { event: string; conditions?: Condition[]; and_operator?: boolean };

const emptyCondition: Condition = { attribute: 'status', operator: 'equal_to', value: '' };
const defaultTrigger: Trigger = {
  event: 'conversation_created',
  conditions: [emptyCondition],
  and_operator: true,
};
const defaultActions: Action[] = [{ type: 'set_status', status: 'open' }];

const AutomationRulesPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
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

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      description: '',
      enabled: true,
      trigger: { ...defaultTrigger },
      actions: [...defaultActions],
    });
    setOpen(true);
  };

  const openEdit = (r: Row) => {
    const t = (r.trigger ?? {}) as Trigger;
    const a = Array.isArray(r.actions) ? (r.actions as Action[]) : [];
    setEditingId(r.id);
    setForm({
      name: r.name,
      description: (r as Row & { description?: string }).description ?? '',
      enabled: r.enabled,
      trigger: {
        event: t.event ?? 'conversation_created',
        conditions: Array.isArray(t.conditions) && t.conditions.length > 0
          ? t.conditions
          : [emptyCondition],
        and_operator: t.and_operator ?? true,
      },
      actions: a.length > 0 ? a : [...defaultActions],
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const trigger: Trigger = {
        event: form.trigger.event,
        conditions: form.trigger.conditions?.filter((c) => c.attribute || c.value) ?? [],
        and_operator: form.trigger.and_operator ?? true,
      };
      const payload = {
        organization_id: currentOrg.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        enabled: form.enabled,
        trigger,
        actions: form.actions,
      };
      if (editingId) {
        const { error } = await supabase
          .from('automation_rules')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'automation.update',
          entityId: editingId,
        });
      } else {
        const { data, error } = await supabase
          .from('automation_rules')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'automation.create',
          entityId: data.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      setOpen(false);
      setEditingId(null);
      toast.success(editingId ? 'Regra atualizada' : 'Regra criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clone = useMutation({
    mutationFn: async (r: Row) => {
      if (!currentOrg) return;
      const { data, error } = await supabase
        .from('automation_rules')
        .insert({
          organization_id: currentOrg.id,
          name: `${r.name} (cópia)`,
          description: (r as Row & { description?: string }).description ?? null,
          enabled: false,
          trigger: r.trigger,
          actions: r.actions,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'automation.create',
        entityId: data.id,
        metadata: { cloned_from: r.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Regra clonada');
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

  const addCondition = () => {
    setForm({
      ...form,
      trigger: {
        ...form.trigger,
        conditions: [...(form.trigger.conditions ?? []), { ...emptyCondition }],
      },
    });
  };

  const removeCondition = (idx: number) => {
    const c = form.trigger.conditions ?? [];
    if (c.length <= 1) return;
    setForm({
      ...form,
      trigger: {
        ...form.trigger,
        conditions: c.filter((_, i) => i !== idx),
      },
    });
  };

  const updateCondition = (idx: number, field: keyof Condition, value: string) => {
    const c = [...(form.trigger.conditions ?? [])];
    c[idx] = { ...c[idx], [field]: value };
    setForm({ ...form, trigger: { ...form.trigger, conditions: c } });
  };

  const addAction = () => {
    setForm({ ...form, actions: [...form.actions, { type: 'set_status', status: 'open' }] });
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
              <Zap className="h-7 w-7" />
              Automação
            </h1>
            <p className="text-sm text-muted-foreground">
              Regras com evento, condições e acções. Estrutura Chatwoot.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova regra
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? 'Editar regra' : 'Nova regra'}</DialogTitle>
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
                    <Label>Descrição (opcional)</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Breve descrição"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.enabled}
                      onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                    />
                    <span className="text-sm">Activa</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Evento</Label>
                    <Select
                      value={form.trigger.event}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          trigger: { ...form.trigger, event: v },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTOMATION_EVENTS.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Condições</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={form.trigger.and_operator ? 'and' : 'or'}
                          onValueChange={(v) =>
                            setForm({
                              ...form,
                              trigger: { ...form.trigger, and_operator: v === 'and' },
                            })
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="and">AND</SelectItem>
                            <SelectItem value="or">OR</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(form.trigger.conditions ?? []).map((cond, idx) => (
                        <div key={idx} className="flex flex-wrap gap-2 items-center p-2 rounded border bg-muted/30">
                          <Input
                            className="w-28"
                            value={cond.attribute}
                            onChange={(e) => updateCondition(idx, 'attribute', e.target.value)}
                            placeholder="attribute"
                          />
                          <Select
                            value={cond.operator}
                            onValueChange={(v) => updateCondition(idx, 'operator', v)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITION_OPERATORS.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="flex-1 min-w-[100px]"
                            value={cond.value}
                            onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                            placeholder="value"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCondition(idx)}
                            disabled={(form.trigger.conditions ?? []).length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
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
                        const def = ACTION_TYPES.find((a) => a.id === act.type);
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
                                {ACTION_TYPES.map((t) => (
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
          {rows.map((r: Row) => {
            const t = (r.trigger ?? {}) as Trigger;
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    {(r as Row & { description?: string }).description && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        — {(r as Row & { description?: string }).description}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      Event: {t.event ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={() => toggleEnabled.mutate(r)}
                      />
                    )}
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => clone.mutate(r)} title="Clonar">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto">
                  {JSON.stringify({ trigger: r.trigger, actions: r.actions }, null, 2)}
                </pre>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma regra definida.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutomationRulesPage;
