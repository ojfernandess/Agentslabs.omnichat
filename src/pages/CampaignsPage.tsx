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
import { Megaphone, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'campaigns'>;

const CampaignsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin', 'supervisor'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    message_body: '',
    channel_id: '',
    audience: '{}',
  });

  const { data: rows = [] } = useQuery({
    queryKey: ['campaigns', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels-campaigns', currentOrg?.id],
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
      let audience_filter: Record<string, unknown>;
      try {
        audience_filter = JSON.parse(form.audience || '{}');
      } catch {
        throw new Error('JSON de audiência inválido');
      }
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          organization_id: currentOrg.id,
          name: form.name.trim(),
          message_body: form.message_body.trim(),
          channel_id: form.channel_id || null,
          audience_filter,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'campaign.create',
        entityId: data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setOpen(false);
      setForm({ name: '', message_body: '', channel_id: '', audience: '{}' });
      toast.success('Campanha criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (c: Row) => {
      if (!currentOrg) return;
      const { error } = await supabase
        .from('campaigns')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', c.id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'campaign.sent',
        entityId: c.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Estado actualizado para «enviada». O envio real pelos canais deve ser feito pelo worker.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-7 w-7" />
              Campanhas
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina mensagens e audiência (JSON). O envio em massa pelos canais liga-se a filas e
              webhooks.
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova campanha
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nova campanha</DialogTitle>
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
                  <div className="space-y-1">
                    <Label>Canal (opcional)</Label>
                    <Select
                      value={form.channel_id || 'none'}
                      onValueChange={(v) => setForm({ ...form, channel_id: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Mensagem</Label>
                    <Textarea
                      rows={5}
                      value={form.message_body}
                      onChange={(e) => setForm({ ...form, message_body: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Audiência (JSON)</Label>
                    <Textarea
                      rows={4}
                      className="font-mono text-xs"
                      value={form.audience}
                      onChange={(e) => setForm({ ...form, audience: e.target.value })}
                      placeholder='{ "tags": ["vip"] }'
                    />
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
          {rows.map((r: Row) => (
            <div key={r.id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs uppercase text-muted-foreground">{r.status}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{r.message_body}</p>
              {canEdit && r.status === 'draft' && (
                <Button size="sm" variant="secondary" onClick={() => markSent.mutate(r)}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Marcar como enviada
                </Button>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma campanha.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignsPage;
