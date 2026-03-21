import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Plus, Users, Shield, Eye, Headphones, Crown } from 'lucide-react';

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
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Equipe</h1>
            <p className="text-muted-foreground text-sm">{members.length} membros</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {members.map((member: any) => (
            <div key={member.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
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
                    <span className={`h-2 w-2 rounded-full ${
                      member.status === 'online' ? 'bg-status-online' :
                      member.status === 'away' ? 'bg-status-away' : 'bg-status-offline'
                    }`} />
                    <span className="text-xs text-muted-foreground capitalize">{member.status || 'offline'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamPage;
