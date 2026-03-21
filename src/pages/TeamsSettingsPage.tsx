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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UsersRound, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Team = Tables<'teams'>;

const TeamsSettingsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [memberPick, setMemberPick] = useState('');

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-admin', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: orgMembers = [] } = useQuery({
    queryKey: ['org-members-teams', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('id, display_name, role')
        .eq('organization_id', currentOrg.id)
        .order('display_name');
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: teamMembersByTeam = {} } = useQuery({
    queryKey: ['team-members-map', currentOrg?.id, teams.map((t) => t.id).join(',')],
    queryFn: async () => {
      if (!currentOrg || teams.length === 0) return {};
      const { data, error } = await supabase
        .from('team_members')
        .select('id, team_id, member_id')
        .in(
          'team_id',
          teams.map((t) => t.id)
        );
      if (error) throw error;
      const map: Record<string, Array<{ id: string; team_id: string; member_id: string }>> = {};
      for (const row of data ?? []) {
        if (!map[row.team_id]) map[row.team_id] = [];
        map[row.team_id]!.push(row);
      }
      return map;
    },
    enabled: !!currentOrg && teams.length > 0,
  });

  const memberName = (memberId: string) =>
    orgMembers.find((m) => m.id === memberId)?.display_name ?? memberId.slice(0, 8);

  const createTeam = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const { data, error } = await supabase
        .from('teams')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'team.create',
        entityType: 'team',
        entityId: data.id,
        metadata: { name: form.name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-admin'] });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      toast.success('Time criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrg) return;
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'team.delete',
        entityType: 'team',
        entityId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-admin'] });
      queryClient.invalidateQueries({ queryKey: ['team-members-map'] });
      toast.success('Time eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!addMemberTeamId || !memberPick) return;
      const { error } = await supabase.from('team_members').insert({
        team_id: addMemberTeamId,
        member_id: memberPick,
      });
      if (error) throw error;
      if (currentOrg) {
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'team.add_member',
          entityType: 'team',
          entityId: addMemberTeamId,
          metadata: { member_id: memberPick },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-map'] });
      setAddMemberTeamId(null);
      setMemberPick('');
      toast.success('Membro adicionado ao time');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (payload: { rowId: string; teamId: string }) => {
      const { error } = await supabase.from('team_members').delete().eq('id', payload.rowId);
      if (error) throw error;
      if (currentOrg) {
        await logAudit(supabase, {
          organizationId: currentOrg.id,
          action: 'team.remove_member',
          entityType: 'team',
          entityId: payload.teamId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-map'] });
      toast.success('Membro removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersRound className="h-7 w-7" />
              Times
            </h1>
            <p className="text-muted-foreground text-sm">
              Agrupe agentes por equipa (roteamento e permissões). As conversas podem usar{' '}
              <code className="text-xs">team_id</code>.
            </p>
          </div>
          {canEdit && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo time
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar time</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createTeam.mutate();
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
                    <Label>Descrição</Label>
                    <Textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createTeam.isPending}>
                    Criar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="space-y-4">
          {teams.length === 0 ? (
            <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground text-sm">
              Nenhum time. Crie um para segmentar agentes.
            </div>
          ) : (
            teams.map((t: Team) => {
              const members = (teamMembersByTeam[t.id] ?? []) as Array<{
                id: string;
                team_id: string;
                member_id: string;
              }>;
              return (
                <div key={t.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      {t.description && (
                        <p className="text-sm text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTeam.mutate(t.id)}
                        title="Eliminar time"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      >
                        {memberName(m.member_id)}
                        {canEdit && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeMember.mutate({ rowId: m.id, teamId: t.id })}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <Label className="text-xs">Adicionar agente</Label>
                        <Select
                          value={addMemberTeamId === t.id ? memberPick : ''}
                          onValueChange={(v) => {
                            setAddMemberTeamId(t.id);
                            setMemberPick(v);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Escolher membro…" />
                          </SelectTrigger>
                          <SelectContent>
                            {orgMembers.map((om) => (
                              <SelectItem key={om.id} value={om.id}>
                                {om.display_name ?? om.id.slice(0, 8)} ({om.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={addMemberTeamId !== t.id || !memberPick}
                        onClick={() => addMember.mutate()}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamsSettingsPage;
