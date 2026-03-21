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
import { Clock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'sla_policies'>;

const SlaPoliciesPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    first_reply_minutes: 30,
    resolution_minutes: 240,
    priority_filter: '' as string,
    channel_id: '' as string,
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['sla-policies', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('sla_policies')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels-sla', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase.from('channels').select('id, name').eq('organization_id', currentOrg.id);
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const { data, error } = await supabase
        .from('sla_policies')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          first_reply_minutes: form.first_reply_minutes,
          resolution_minutes: form.resolution_minutes,
          priority_filter: form.priority_filter.trim() || null,
          channel_id: form.channel_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'sla.create',
        entityId: data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      setOpen(false);
      toast.success('Política SLA criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrg) return;
      const { error } = await supabase.from('sla_policies').delete().eq('id', id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'sla.delete',
        entityId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast.success('Removida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyToOpen = useMutation({
    mutationFn: async (policy: Row) => {
      if (!currentOrg) return;
      const now = Date.now();
      const firstDue = new Date(now + policy.first_reply_minutes * 60_000).toISOString();
      const resDue = new Date(now + policy.resolution_minutes * 60_000).toISOString();
      const { error } = await supabase
        .from('conversations')
        .update({
          sla_policy_id: policy.id,
          sla_first_reply_due_at: firstDue,
          sla_resolution_due_at: resDue,
        })
        .eq('organization_id', currentOrg.id)
        .in('status', ['open', 'pending']);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'sla.apply_open',
        entityId: policy.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('SLA aplicado às conversas abertas/pendentes');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-7 w-7" />
              SLA
            </h1>
            <p className="text-sm text-muted-foreground">
              Metas de primeira resposta e resolução. Pode aplicar a conversas já abertas.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova política
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Política SLA</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label>Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>1ª resposta (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.first_reply_minutes}
                        onChange={(e) =>
                          setForm({ ...form, first_reply_minutes: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Resolução (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.resolution_minutes}
                        onChange={(e) =>
                          setForm({ ...form, resolution_minutes: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Filtro prioridade (opcional)</Label>
                    <Select
                      value={form.priority_filter || 'all'}
                      onValueChange={(v) => setForm({ ...form, priority_filter: v === 'all' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="urgent">urgent</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Canal (opcional)</Label>
                    <Select
                      value={form.channel_id || 'all'}
                      onValueChange={(v) => setForm({ ...form, channel_id: v === 'all' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={create.isPending}>
                    Criar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="space-y-3">
          {policies.map((p: Row) => (
            <div key={p.id} className="rounded-lg border bg-card p-4 flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  1ª resposta: {p.first_reply_minutes} min · Resolução: {p.resolution_minutes} min
                  {p.priority_filter && ` · prioridade: ${p.priority_filter}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button size="sm" variant="secondary" onClick={() => applyToOpen.mutate(p)}>
                    Aplicar a abertas
                  </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma política.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlaPoliciesPage;
