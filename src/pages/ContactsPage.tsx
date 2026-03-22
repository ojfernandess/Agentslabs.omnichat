import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Search, ChevronDown, ChevronUp, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;
const SOCIAL_KEYS = ['linkedin', 'facebook', 'instagram', 'tiktok', 'twitter', 'github'] as const;
const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X (Twitter)',
  github: 'GitHub',
};

const getCustomField = (cf: Record<string, unknown> | null | undefined, key: string): string =>
  (cf && typeof cf[key] === 'string' ? cf[key] : '') as string;

const ContactCard: React.FC<{
  contact: any;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  isHighlighted: boolean;
  orgMembers: { id: string; display_name: string }[];
}> = ({ contact, isExpanded, onToggle, onUpdate, onDelete, isHighlighted, orgMembers }) => {
  const cf = (contact.custom_fields || {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    name: contact.name ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    company: contact.company ?? '',
    city: getCustomField(cf, 'city'),
    country: getCustomField(cf, 'country'),
    bio: getCustomField(cf, 'bio'),
    ...Object.fromEntries(SOCIAL_KEYS.map((k) => [k, getCustomField(cf, k)])),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { custom_fields, ...rest } = patch as any;
      const upd: Record<string, unknown> = { ...rest };
      if (custom_fields !== undefined) {
        upd.custom_fields = { ...(contact.custom_fields as object || {}), ...custom_fields };
      }
      const { error } = await supabase.from('contacts').update(upd).eq('id', contact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contato atualizado');
      onUpdate({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (isExpanded) {
      const cf = (contact.custom_fields || {}) as Record<string, unknown>;
      setForm({
        name: contact.name ?? '',
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        company: contact.company ?? '',
        city: getCustomField(cf, 'city'),
        country: getCustomField(cf, 'country'),
        bio: getCustomField(cf, 'bio'),
        ...Object.fromEntries(SOCIAL_KEYS.map((k) => [k, getCustomField(cf, k)])),
      });
    }
  }, [isExpanded, contact.id, contact.name, contact.email, contact.phone, contact.company, contact.custom_fields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const custom_fields: Record<string, string> = {};
    if (form.city) custom_fields.city = form.city;
    if (form.country) custom_fields.country = form.country;
    if (form.bio) custom_fields.bio = form.bio;
    SOCIAL_KEYS.forEach((k) => { if (form[k]) custom_fields[k] = form[k]; });
    updateMutation.mutate({
      name: form.name || null,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      custom_fields: Object.keys(custom_fields).length ? custom_fields : undefined,
    });
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card overflow-hidden transition-colors',
        isHighlighted && 'ring-1 ring-primary/30 bg-primary/5'
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {contact.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{contact.name || 'Sem nome'}</p>
              <p className="text-sm text-muted-foreground truncate">{contact.email || contact.phone || '—'}</p>
            </div>
            <Link
              to={`/conversations`}
              state={{ contactId: contact.id }}
              className="text-xs text-primary hover:underline shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              Ver detalhes
            </Link>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-4 space-y-6 bg-muted/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h4 className="text-sm font-medium">Alterar detalhes do contato</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nome do contato"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Digite o nome da cidade"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>País</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    placeholder="Selecione o país"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Biografia</Label>
                  <Textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Digite uma biografia"
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Empresa</Label>
                  <Input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Digite o nome da empresa"
                    className="mt-1"
                  />
                </div>
              </div>

              <h4 className="text-sm font-medium pt-2">Editar redes sociais</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SOCIAL_KEYS.map((key) => (
                  <div key={key}>
                    <Label>{SOCIAL_LABELS[key]}</Label>
                    <Input
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={`Adicionar ${SOCIAL_LABELS[key]}`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={updateMutation.isPending}>
                Atualizar contato
              </Button>
            </form>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">
                Excluir <strong>{contact.name || 'este contato'}</strong>? Esta ação remove todas as conversas e o histórico de mensagens.
              </p>
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  Excluir contato
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir contato e histórico</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir <strong>{contact.name || 'este contato'}</strong>? Todas as conversas e o histórico de mensagens serão removidos permanentemente. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={onDelete}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const ContactsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const contactIdFromUrl = searchParams.get('id');
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: orgMembers = [] } = useQuery({
    queryKey: ['org-members', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('id, display_name')
        .eq('organization_id', currentOrg.id)
        .order('display_name');
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const createContact = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      await supabase.from('contacts').insert({
        organization_id: currentOrg.id,
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setDialogOpen(false);
      setForm({ name: '', email: '', phone: '', company: '' });
      toast.success('Contato adicionado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error: convErr } = await supabase.from('conversations').delete().eq('contact_id', id);
      if (convErr) throw convErr;
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setExpandedId(null);
      toast.success('Contato excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasOpenedEditForUrl = useRef(false);
  useEffect(() => {
    if (contactIdFromUrl && contacts.length > 0 && !hasOpenedEditForUrl.current) {
      const c = contacts.find((x: any) => x.id === contactIdFromUrl);
      if (c) {
        hasOpenedEditForUrl.current = true;
        setSearchTerm(c.name || '');
        setExpandedId(c.id);
      }
    }
  }, [contactIdFromUrl, contacts]);

  const filtered = contacts.filter((c: any) => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(t) ||
      c.email?.toLowerCase().includes(t) ||
      c.phone?.includes(t) ||
      c.company?.toLowerCase().includes(t)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
        {/* Header — estilo Chatwoot */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <h1 className="text-2xl font-bold">Contatos</h1>
          <div className="flex flex-1 w-full sm:max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" title="Filtrar">
              <span className="sr-only">Filtrar</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/conversations" state={{ openNewMessage: true }}>
                <Mail className="h-4 w-4 mr-2" />
                Enviar Mensagem
              </Link>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setForm({ name: '', email: '', phone: '', company: '' }); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo contato
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar contato</DialogTitle>
                  <DialogDescription>Preencha os dados do novo contato.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createContact.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Empresa</Label>
                    <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={createContact.isPending}>Adicionar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Lista em accordion */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
              Nenhum contato encontrado. Crie um novo contato para começar.
            </div>
          ) : (
            paginated.map((contact: any) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                isExpanded={expandedId === contact.id}
                onToggle={() => setExpandedId((prev) => (prev === contact.id ? null : contact.id))}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['contacts'] })}
                onDelete={() => deleteContact.mutate(contact.id)}
                isHighlighted={contactIdFromUrl === contact.id}
                orgMembers={orgMembers}
              />
            ))
          )}
        </div>

        {/* Paginação */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>Exibindo {startItem} - {endItem} de {filtered.length} contatos</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={page <= 1}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Anterior
              </Button>
              <span className="px-2">
                {page} de {totalPages} páginas
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
              >
                Última
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactsPage;
