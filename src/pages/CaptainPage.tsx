import React, { useEffect, useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';

const CaptainPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const queryClient = useQueryClient();
  const canEdit = currentMember && ['owner', 'admin'].includes(currentMember.role);
  const [enabled, setEnabled] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const { data: row } = useQuery({
    queryKey: ['captain-settings', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data, error } = await supabase
        .from('captain_settings')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrg,
  });

  useEffect(() => {
    if (row) {
      setEnabled(row.enabled);
      setApiBaseUrl(row.api_base_url ?? '');
      setApiKey(row.api_key ?? '');
      setModel(row.model ?? '');
      setSystemPrompt(row.system_prompt ?? '');
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const { error } = await supabase.from('captain_settings').upsert(
        {
          organization_id: currentOrg.id,
          enabled,
          api_base_url: apiBaseUrl.trim() || null,
          api_key: apiKey.trim() || null,
          model: model.trim() || null,
          system_prompt: systemPrompt.trim() || null,
        },
        { onConflict: 'organization_id' }
      );
      if (error) throw error;
      await logAudit(supabase, {
        organizationId: currentOrg.id,
        action: 'captain.update',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captain-settings'] });
      toast.success('Capitão guardado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7" />
            Capitão (IA)
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure um endpoint compatível com OpenAI (base URL + API key) ou outro proxy. O envio de
            mensagens ao modelo pode ser ligado ao composer noutra iteração.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Activar</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label>API base URL</Label>
            <Input
              placeholder="https://api.openai.com/v1"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label>API key</Label>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={!canEdit}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <Label>Modelo</Label>
            <Input
              placeholder="gpt-4o-mini"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label>System prompt</Label>
            <Textarea
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Guardar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptainPage;
