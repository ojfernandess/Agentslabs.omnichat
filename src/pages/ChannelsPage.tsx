import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Hash, MessageCircle, Mail, Send, Phone, Globe, Smartphone } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type ChannelType = Database['public']['Enums']['channel_type'];

const channelMeta: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  whatsapp: { icon: <Phone className="h-4 w-4" />, label: 'WhatsApp', color: 'text-channel-whatsapp' },
  messenger: { icon: <MessageCircle className="h-4 w-4" />, label: 'Messenger', color: 'text-channel-messenger' },
  instagram: { icon: <Globe className="h-4 w-4" />, label: 'Instagram', color: 'text-channel-instagram' },
  telegram: { icon: <Send className="h-4 w-4" />, label: 'Telegram', color: 'text-channel-telegram' },
  email: { icon: <Mail className="h-4 w-4" />, label: 'E-mail', color: 'text-channel-email' },
  livechat: { icon: <MessageCircle className="h-4 w-4" />, label: 'Live Chat', color: 'text-channel-livechat' },
  sms: { icon: <Smartphone className="h-4 w-4" />, label: 'SMS', color: 'text-channel-sms' },
};

const ChannelsPage: React.FC = () => {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', channel_type: '' as ChannelType | '' });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('channels')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const createChannel = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !form.channel_type) return;
      await supabase.from('channels').insert({
        organization_id: currentOrg.id,
        name: form.name,
        channel_type: form.channel_type as ChannelType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setDialogOpen(false);
      setForm({ name: '', channel_type: '' });
    },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Canais</h1>
            <p className="text-muted-foreground text-sm">Configure seus canais de atendimento</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo canal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar canal</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createChannel.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: WhatsApp Principal" required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de canal</Label>
                  <Select value={form.channel_type} onValueChange={(v) => setForm({ ...form, channel_type: v as ChannelType })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(channelMeta).map(([key, meta]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span className={meta.color}>{meta.icon}</span>
                            {meta.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={!form.channel_type}>Adicionar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {channels.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Hash className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhum canal configurado</p>
              <p className="text-xs mt-1">Adicione seu primeiro canal de atendimento</p>
            </div>
          ) : (
            channels.map((channel: any) => {
              const meta = channelMeta[channel.channel_type] || { icon: <Hash className="h-4 w-4" />, label: channel.channel_type, color: '' };
              return (
                <div key={channel.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{channel.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.label}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`h-2 w-2 rounded-full ${channel.is_active ? 'bg-status-online' : 'bg-status-offline'}`} />
                        <span className="text-xs text-muted-foreground">{channel.is_active ? 'Ativo' : 'Inativo'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelsPage;
