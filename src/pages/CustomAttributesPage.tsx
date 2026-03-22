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
import { Braces, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'custom_attribute_definitions'>;

const CustomAttributesPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entity_type: 'conversation' as 'conversation' | 'contact',
    attribute_key: '',
    label: '',
    description: '',
    value_type: 'text' as 'text' | 'number' | 'boolean' | 'list' | 'link' | 'date',
    list_options: '',
  });

  const { data: rows = [] } = useQuery({
    queryKey: ['custom-attributes', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('custom_attribute_definitions')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      let list_options: unknown = null;
      if (form.value_type === 'list' && form.list_options.trim()) {
        try {
          list_options = JSON.parse(form.list_options);
        } catch {
          throw new Error('Opções da lista: JSON inválido');
        }
      }
      const { data, error } = await supabase
        .from('custom_attribute_definitions')
        .insert({
          organization_id: currentOrg.id,
          entity_type: form.entity_type,
          attribute_key: form.attribute_key.trim().toLowerCase().replace(/\s+/g, '_'),
          label: form.label.trim(),
          description: form.description.trim() || null,
          value_type: form.value_type,
          list_options: list_options as Row['list_options'],
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'custom_attribute.create',
        entityId: data.id,
        metadata: { key: form.attribute_key },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-attributes'] });
      setOpen(false);
      setForm({
        entity_type: 'conversation',
        attribute_key: '',
        label: '',
        description: '',
        value_type: 'text',
        list_options: '',
      });
      toast.success('Atributo criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrg) return;
      const { error } = await supabase.from('custom_attribute_definitions').delete().eq('id', id);
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'custom_attribute.delete',
        entityId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-attributes'] });
      toast.success('Removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Braces className="h-7 w-7" />
              Atributos personalizados
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina chaves para preencher em <code>custom_attributes</code> (conversas) e{' '}
              <code>custom_fields</code> (contactos).
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo atributo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo atributo</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label>Applies to</Label>
                    <Select
                      value={form.entity_type}
                      onValueChange={(v) =>
                        setForm({ ...form, entity_type: v as 'conversation' | 'contact' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conversation">Conversation</SelectItem>
                        <SelectItem value="contact">Contact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Display name</Label>
                    <Input
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                      required
                      placeholder="e.g. Order ID"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Key</Label>
                    <Input
                      value={form.attribute_key}
                      onChange={(e) => setForm({ ...form, attribute_key: e.target.value })}
                      required
                      placeholder="e.g. order_id"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select
                      value={form.value_type}
                      onValueChange={(v) =>
                        setForm({ ...form, value_type: v as typeof form.value_type })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="list">List</SelectItem>
                        <SelectItem value="boolean">Checkbox</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.value_type === 'list' && (
                    <div className="space-y-1">
                      <Label>Opções (JSON array)</Label>
                      <Input
                        value={form.list_options}
                        onChange={(e) => setForm({ ...form, list_options: e.target.value })}
                        placeholder='["a","b"]'
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={create.isPending}>
                    Guardar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma definição.</p>
          ) : (
            rows.map((r: Row) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-mono text-primary">{r.attribute_key}</span>
                  <span className="text-muted-foreground"> — {r.label}</span>
                  {'description' in r && r.description && (
                    <span className="ml-2 text-xs text-muted-foreground">({r.description})</span>
                  )}
                  <span className="ml-2 text-xs uppercase text-muted-foreground">
                    {r.entity_type} / {r.value_type}
                  </span>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomAttributesPage;
