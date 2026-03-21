import React from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, Headphones, Crown } from 'lucide-react';
import { toast } from 'sonner';

const roleLabels: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Agente',
};

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  supervisor: <Eye className="h-3 w-3" />,
  agent: <Headphones className="h-3 w-3" />,
};

const TeamPage: React.FC = () => {
  const location = useLocation();
  const pageTitle = location.pathname.includes('/settings/agents') ? 'Agentes' : 'Equipe';
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEditSkills =
    currentMember && ['owner', 'admin'].includes(currentMember.role);

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const updateSkills = useMutation({
    mutationFn: async (payload: { memberId: string; skill_tags: string[] }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ skill_tags: payload.skill_tags })
        .eq('id', payload.memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', currentOrg?.id] });
      toast.success('Especialidades actualizadas');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">{members.length} membros</p>
            {canEditSkills && (
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Roteamento: defina tags por agente (ex.: suporte, vendas). As caixas de entrada podem exigir
                as mesmas tags para priorizar quem recebe novas conversas.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {members.map((member: any) => (
            <div key={member.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow space-y-3">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                  {member.display_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{member.display_name || 'Sem nome'}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {roleIcons[member.role]}
                    <span className="text-xs text-muted-foreground">{roleLabels[member.role]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        member.status === 'online'
                          ? 'bg-status-online'
                          : member.status === 'away'
                          ? 'bg-status-away'
                          : 'bg-status-offline'
                      }`}
                    />
                    <span className="text-xs text-muted-foreground capitalize">{member.status || 'offline'}</span>
                  </div>
                </div>
              </div>
              {canEditSkills && member.role === 'agent' && (
                <div className="pt-2 border-t space-y-1">
                  <Label className="text-xs">Tags de especialidade</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="suporte, whatsapp"
                    defaultValue={(member.skill_tags as string[] | undefined)?.join(', ') ?? ''}
                    onBlur={(e) => {
                      const tags = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const prev = ((member.skill_tags as string[] | undefined) ?? []).join(',');
                      const next = tags.join(',');
                      if (prev !== next) {
                        updateSkills.mutate({ memberId: member.id, skill_tags: tags });
                      }
                    }}
                    disabled={updateSkills.isPending}
                  />
                </div>
              )}
              {Array.isArray(member.skill_tags) && member.skill_tags.length > 0 && !canEditSkills && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {member.skill_tags.map((t: string) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamPage;
