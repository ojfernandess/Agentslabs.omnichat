import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import type { Tables } from '@/integrations/supabase/types';

type Cat = Tables<'help_center_categories'>;
type Art = Tables<'help_center_articles'>;

const HelpCenterAdminPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin', 'supervisor'].includes(currentMember.role);
  const [catOpen, setCatOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', slug: '' });
  const [artForm, setArtForm] = useState({
    title: '',
    slug: '',
    body: '',
    category_id: '',
    published: false,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['help-categories', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('help_center_categories')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: articles = [] } = useQuery({
    queryKey: ['help-articles', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from('help_center_articles')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const createCat = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const slug = catForm.slug.trim() || catForm.name.toLowerCase().replace(/\s+/g, '-');
      const { error } = await supabase.from('help_center_categories').insert({
        organization_id: currentOrg.id,
        name: catForm.name.trim(),
        slug,
      });
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'help_center.category_create',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-categories'] });
      setCatOpen(false);
      setCatForm({ name: '', slug: '' });
      toast.success('Categoria criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createArt = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const slug = artForm.slug.trim() || artForm.title.toLowerCase().replace(/\s+/g, '-');
      const { error } = await supabase.from('help_center_articles').insert({
        organization_id: currentOrg.id,
        title: artForm.title.trim(),
        slug,
        body: artForm.body.trim(),
        category_id: artForm.category_id || null,
        published: artForm.published,
        published_at: artForm.published ? new Date().toISOString() : null,
      });
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'help_center.article_create',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      setArtOpen(false);
      setArtForm({ title: '', slug: '', body: '', category_id: '', published: false });
      toast.success('Artigo criado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteArt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('help_center_articles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      toast.success('Artigo eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePub = useMutation({
    mutationFn: async (a: Art) => {
      const { error } = await supabase
        .from('help_center_articles')
        .update({
          published: !a.published,
          published_at: !a.published ? new Date().toISOString() : null,
        })
        .eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['help-articles'] }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" />
            Central de ajuda
          </h1>
          <p className="text-sm text-muted-foreground">
            Artigos internos por organização. Portal público pode usar estes dados com rotas
            dedicadas.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Categorias</h2>
            {canEdit && (
              <Dialog open={catOpen} onOpenChange={setCatOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Categoria
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova categoria</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createCat.mutate();
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <Label>Nome</Label>
                      <Input
                        value={catForm.name}
                        onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Slug (opcional)</Label>
                      <Input
                        value={catForm.slug}
                        onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Criar
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c: Cat) => (
              <span key={c.id} className="rounded-full border px-3 py-1 text-sm">
                {c.name}
              </span>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem categorias.</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Artigos</h2>
            {canEdit && (
              <Dialog open={artOpen} onOpenChange={setArtOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Artigo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Novo artigo</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createArt.mutate();
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <Label>Título</Label>
                      <Input
                        value={artForm.title}
                        onChange={(e) => setArtForm({ ...artForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Slug (opcional)</Label>
                      <Input
                        value={artForm.slug}
                        onChange={(e) => setArtForm({ ...artForm, slug: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Categoria</Label>
                      <Select
                        value={artForm.category_id || 'none'}
                        onValueChange={(v) =>
                          setArtForm({ ...artForm, category_id: v === 'none' ? '' : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {categories.map((c: Cat) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Conteúdo</Label>
                      <Textarea
                        rows={8}
                        value={artForm.body}
                        onChange={(e) => setArtForm({ ...artForm, body: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={artForm.published}
                        onCheckedChange={(v) => setArtForm({ ...artForm, published: v })}
                      />
                      <span className="text-sm">Publicado</span>
                    </div>
                    <Button type="submit" className="w-full">
                      Criar
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="space-y-2">
            {articles.map((a: Art) => (
              <div key={a.id} className="rounded-lg border bg-card p-3 flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <>
                      <Switch checked={a.published} onCheckedChange={() => togglePub.mutate(a)} />
                      <Button variant="ghost" size="icon" onClick={() => deleteArt.mutate(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {articles.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem artigos.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default HelpCenterAdminPage;
