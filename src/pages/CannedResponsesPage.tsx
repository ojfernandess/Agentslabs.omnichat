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
import { MessageSquareQuote, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Canned = Tables<'canned_responses'>;

const CannedResponsesPage: React.FC = () => {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Canned | null>(null);
  const [form, setForm] = useState({ short_code: '', content: '' });

  const { data: rows = [] } = useQuery({
    queryKey: ['canned-responses', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('canned_responses')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('short_code', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const resetForm = () => setForm({ short_code: '', content: '' });

  const create = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const { error } = await supabase.from('canned_responses').insert({
        organization_id: currentOrg.id,
        short_code: form.short_code.trim(),
        content: form.content.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      setCreateOpen(false);
      resetForm();
      toast.success('Resposta pronta criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editRow) return;
      const { error } = await supabase
        .from('canned_responses')
        .update({
          short_code: form.short_code.trim(),
          content: form.content.trim(),
        })
        .eq('id', editRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      setEditRow(null);
      resetForm();
      toast.success('Resposta actualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('canned_responses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      toast.success('Removida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (r: Canned) => {
    setForm({ short_code: r.short_code, content: r.content });
    setEditRow(r);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Respostas prontas</h1>
            <p className="text-muted-foreground text-sm">
              Atalhos de texto por código curto (equivalente a canned responses no Chatwoot).
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova resposta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar resposta pronta</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="ccode">Código curto</Label>
                  <Input
                    id="ccode"
                    placeholder="ex: saudacao, horario"
                    value={form.short_code}
                    onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ccontent">Conteúdo</Label>
                  <Textarea
                    id="ccontent"
                    rows={5}
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  Guardar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          {rows.length === 0 ? (
            <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquareQuote className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma resposta pronta</p>
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:shadow-sm transition-shadow"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-mono font-semibold text-primary">{r.short_code}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{r.content}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(r.id)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Dialog
          open={!!editRow}
          onOpenChange={(o) => {
            if (!o) {
              setEditRow(null);
              resetForm();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar resposta pronta</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Código curto</Label>
                <Input
                  value={form.short_code}
                  onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full" disabled={update.isPending}>
                Actualizar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CannedResponsesPage;
