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
import { Plus, Tag, X } from 'lucide-react';

const LabelsPage: React.FC = () => {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#3B82F6', description: '' });

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('labels')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const createLabel = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      await supabase.from('labels').insert({
        organization_id: currentOrg.id,
        name: form.name,
        color: form.color,
        description: form.description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setDialogOpen(false);
      setForm({ name: '', color: '#3B82F6', description: '' });
    },
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('labels').delete().eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Etiquetas</h1>
            <p className="text-muted-foreground text-sm">Organize suas conversas com etiquetas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova etiqueta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar etiqueta</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createLabel.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-10 rounded border cursor-pointer" />
                    <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">Criar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {labels.length === 0 ? (
            <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Tag className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma etiqueta criada</p>
            </div>
          ) : (
            labels.map((label: any) => (
              <div key={label.id} className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <div>
                    <p className="text-sm font-medium">{label.name}</p>
                    {label.description && <p className="text-xs text-muted-foreground">{label.description}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteLabel.mutate(label.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LabelsPage;
