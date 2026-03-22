import React, { useState, useEffect } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Copy, Check, RefreshCw, Volume2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useNotificationSound, SOUND_TONE_OPTIONS, type SoundTone } from '@/hooks/useNotificationSound';

const STORAGE_COMPOSER_MOD = 'agentslabs_composer_mod_key';
const STORAGE_NOTIFICATION_PREFS = 'agentslabs_notification_prefs';
const STORAGE_PUSH_ENABLED = 'agentslabs_push_enabled';

const FONT_OPTIONS = [
  { value: 'default', label: 'Padrão' },
  { value: 'small', label: 'Pequeno' },
  { value: 'large', label: 'Grande' },
];

const LANG_OPTIONS = [
  { value: 'pt-BR', label: 'Português Brasileiro (pt-BR)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

const COMPOSER_OPTIONS = [
  { value: 'enter', label: 'Enter (↵)', desc: 'Enviar ao pressionar Enter' },
  { value: 'mod_enter', label: 'Cmd/Ctrl + Enter (⌘ + ↵)', desc: 'Enviar ao pressionar Cmd/Ctrl + Enter' },
] as const;

const NOTIFICATION_ROWS = [
  { key: 'new_conversation', label: 'Nova conversa criada' },
  { key: 'assigned_to_you', label: 'Conversa atribuída a si' },
  { key: 'mentioned', label: 'Mencionado numa conversa' },
] as const;

type NotificationPrefs = Record<string, { email: boolean; push: boolean }>;

const defaultNotificationPrefs: NotificationPrefs = {
  new_conversation: { email: false, push: true },
  assigned_to_you: { email: true, push: true },
  mentioned: { email: true, push: true },
};

function loadNotificationPrefs(): NotificationPrefs {
  try {
    const v = localStorage.getItem(STORAGE_NOTIFICATION_PREFS);
    if (v) {
      const parsed = JSON.parse(v) as NotificationPrefs;
      return { ...defaultNotificationPrefs, ...parsed };
    }
  } catch {}
  return defaultNotificationPrefs;
}

const ProfileSettingsPage: React.FC = () => {
  const { currentOrg, currentMember, refetch: refetchOrg } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play, playPreview, isEnabled: soundEnabled, setEnabled: setSoundEnabled, getTone, setTone } = useNotificationSound();
  const [copied, setCopied] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: '',
    displayName: '',
    email: '',
  });
  const [signature, setSignature] = useState('');
  const [composerMod, setComposerMod] = useState<'enter' | 'mod_enter'>('mod_enter');
  const [fontSize, setFontSize] = useState('default');
  const [language, setLanguage] = useState('pt-BR');
  const [soundTone, setSoundTone] = useState<SoundTone>('ding');
  const [alertsAssignedToMe, setAlertsAssignedToMe] = useState(true);
  const [alertsUnassigned, setAlertsUnassigned] = useState(false);
  const [alertsAssignedOthers, setAlertsAssignedOthers] = useState(false);
  const [alertsOnlyInactive, setAlertsOnlyInactive] = useState(true);
  const [alertsEvery30s, setAlertsEvery30s] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_PUSH_ENABLED) === 'true'; } catch { return false; }
  });

  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' });

  const memberId = currentMember?.id;

  const { data: memberProfile } = useQuery({
    queryKey: ['profile-settings', memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data, error } = await supabase
        .from('organization_members')
        .select('display_name, avatar_url, full_name, message_signature, ui_settings')
        .eq('id', memberId)
        .single();
      if (error) {
        const { data: fallback } = await supabase
          .from('organization_members')
          .select('display_name, avatar_url')
          .eq('id', memberId)
          .single();
        if (fallback) {
          return { ...fallback, full_name: null, message_signature: null, ui_settings: null };
        }
        throw error;
      }
      return data as {
        display_name: string | null;
        avatar_url: string | null;
        full_name?: string | null;
        message_signature?: string | null;
        ui_settings?: Record<string, unknown> | null;
      };
    },
    enabled: !!memberId,
  });

  useEffect(() => {
    if (memberProfile) {
      setProfileForm((f) => ({
        ...f,
        fullName: (memberProfile.full_name as string) || user?.user_metadata?.full_name || '',
        displayName: memberProfile.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
      }));
      setProfileForm((f) => ({ ...f, email: user?.email || '' }));
      setSignature((memberProfile.message_signature as string) || '');
      const ui = memberProfile.ui_settings as Record<string, string> | null | undefined;
      if (ui?.font_size) setFontSize(ui.font_size);
      if (ui?.language) setLanguage(ui.language);
      if (ui?.composer_mod_key) setComposerMod(ui.composer_mod_key === 'enter' ? 'enter' : 'mod_enter');
    }
  }, [memberProfile, user?.email, user?.user_metadata]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_COMPOSER_MOD);
      if (v === 'enter' || v === 'mod_enter') setComposerMod(v);
    } catch {}
  }, []);

  useEffect(() => {
    setSoundTone(getTone());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NOTIFICATION_PREFS, JSON.stringify(notifPrefs));
    } catch {}
  }, [notifPrefs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PUSH_ENABLED, String(pushEnabled));
    } catch {}
  }, [pushEnabled]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!memberId) throw new Error('Sem membro');
      const fullUpdate = {
        full_name: profileForm.fullName.trim() || null,
        display_name: profileForm.displayName.trim() || null,
        message_signature: signature.trim() || null,
        ui_settings: { font_size: fontSize, language, composer_mod_key: composerMod },
      };
      const { error } = await supabase
        .from('organization_members')
        .update(fullUpdate)
        .eq('id', memberId);
      if (error) {
        const { error: err2 } = await supabase
          .from('organization_members')
          .update({ display_name: profileForm.displayName.trim() || null })
          .eq('id', memberId);
        if (err2) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Perfil atualizado');
      queryClient.invalidateQueries({ queryKey: ['profile-settings', memberId] });
      refetchOrg();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSignature = useMutation({
    mutationFn: async () => {
      if (!memberId) throw new Error('Sem membro');
      const { error } = await supabase
        .from('organization_members')
        .update({ message_signature: signature.trim() || null })
        .eq('id', memberId);
      if (error) {
        throw new Error('Execute a migração 20260322220000 para ativar assinaturas.');
      }
    },
    onSuccess: () => {
      toast.success('Assinatura de mensagens guardada');
      queryClient.invalidateQueries({ queryKey: ['profile-settings', memberId] });
      refetchOrg();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveComposerMod = () => {
    try {
      localStorage.setItem(STORAGE_COMPOSER_MOD, composerMod);
      window.dispatchEvent(new CustomEvent('composerModKeyChanged', { detail: composerMod }));
      updateProfile.mutate();
      toast.success('Preferência guardada');
    } catch {
      toast.error('Erro ao guardar');
    }
  };

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!pwdForm.new || pwdForm.new.length < 6)
        throw new Error('A nova senha deve ter pelo menos 6 caracteres');
      if (pwdForm.new !== pwdForm.confirm)
        throw new Error('A confirmação não coincide');
      const { error } = await supabase.auth.updateUser({ password: pwdForm.new });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Senha alterada');
      setPwdForm({ current: '', new: '', confirm: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestPushPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      toast.error('Notificações push não são suportadas neste browser');
      return false;
    }
    if (Notification.permission === 'granted') {
      setPushEnabled(true);
      toast.success('Notificações push já estão ativas');
      return true;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setPushEnabled(true);
      toast.success('Notificações push ativadas');
      return true;
    }
    setPushEnabled(false);
    toast.info('Permissão negada. Ative manualmente nas definições do browser.');
    return false;
  };

  const { data: apiToken } = useQuery({
    queryKey: ['api-token', memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data, error } = await supabase
        .from('organization_members')
        .select('api_access_token')
        .eq('id', memberId)
        .single();
      if (error) return null;
      return (data as { api_access_token?: string | null })?.api_access_token ?? null;
    },
    enabled: !!memberId,
    retry: false,
  });

  const resetToken = useMutation({
    mutationFn: async () => {
      if (!memberId) throw new Error('Sem membro');
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from('organization_members')
        .update({ api_access_token: newToken })
        .eq('id', memberId);
      if (error) throw error;
      return newToken;
    },
    onSuccess: (newToken) => {
      queryClient.invalidateQueries({ queryKey: ['api-token', memberId] });
      toast.success('Token reiniciado. Atualize as integrações que usam o token antigo.');
      navigator.clipboard.writeText(newToken);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyToken = async () => {
    try {
      let token: string | null = apiToken ?? null;
      if (!token) {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token ?? null;
      }
      if (token) {
        await navigator.clipboard.writeText(token);
        setCopied(true);
        toast.success('Token copiado');
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error('Token não disponível');
      }
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate();
  };

  if (!memberId) {
    return (
      <div className="h-full overflow-y-auto flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-muted-foreground">Selecione uma organização ou aguarde o carregamento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Configurações do Perfil</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Personalize seu perfil, preferências de interface e notificações.
          </p>
        </div>

        {/* A. Profile Basics */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Dados do perfil</h2>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-2xl font-semibold text-muted-foreground">
              {currentMember?.display_name?.slice(0, 2)?.toUpperCase() || profileForm.displayName.slice(0, 2)?.toUpperCase() || 'U'}
            </div>
            <form onSubmit={handleProfileSubmit} className="w-full space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Seu nome completo</Label>
                <Input
                  id="fullName"
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Ex.: João Silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome para exibição</Label>
                <Input
                  id="displayName"
                  value={profileForm.displayName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Como aparece em conversas e e-mails"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Seu e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileForm.email}
                  readOnly
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Para alterar o e-mail, utilize a gestão de conta do provedor de autenticação.
                </p>
              </div>
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'A guardar…' : 'Atualizar o Perfil'}
              </Button>
            </form>
          </div>
        </section>

        {/* B. Interface Preferences */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Preferências de interface</h2>
          <p className="text-sm text-muted-foreground">
            Personalize a aparência do seu painel.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tamanho da fonte</Label>
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Idioma preferido</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
            Guardar preferências
          </Button>
        </section>

        {/* C. Message Signature */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Assinatura de mensagens pessoais</h2>
          <p className="text-sm text-muted-foreground">
            Esta assinatura aparece no final das suas mensagens enviadas. Pode incluir cumprimentos ou informações de contacto.
          </p>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Ex.: Atendimento, Equipe de Suporte"
            rows={4}
            className="resize-y"
          />
          <Button onClick={() => saveSignature.mutate()} disabled={saveSignature.isPending}>
            {saveSignature.isPending ? 'A guardar…' : 'Salvar assinatura de mensagens'}
          </Button>
        </section>

        {/* D. Message Sending Shortcut */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Tecla de atalho para enviar mensagens</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {COMPOSER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setComposerMod(opt.value)}
                className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors ${
                  composerMod === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-medium">{opt.label}</span>
                  {composerMod === opt.value && (
                    <span className="text-primary">
                      <Check className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={saveComposerMod}>
            Guardar preferência
          </Button>
        </section>

        {/* E. Password */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Senha</h2>
          <p className="text-sm text-muted-foreground">
            Alterar a senha da sua conta. Pelo menos 6 caracteres.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              changePassword.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="newPwd">Nova senha</Label>
              <Input
                id="newPwd"
                type="password"
                placeholder="••••••••"
                value={pwdForm.new}
                onChange={(e) => setPwdForm((f) => ({ ...f, new: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPwd">Confirme a nova senha</Label>
              <Input
                id="confirmPwd"
                type="password"
                placeholder="••••••••"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm((f) => ({ ...f, confirm: e.target.value }))}
              />
            </div>
            <Button type="submit" variant="outline" disabled={changePassword.isPending || !pwdForm.new || !pwdForm.confirm}>
              {changePassword.isPending ? 'A guardar…' : 'Mudar Senha'}
            </Button>
          </form>
        </section>

        {/* F. Audio Alerts */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Volume2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Alertas de áudio</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="space-y-1">
              <Label>Reproduzir som ao receber mensagens</Label>
              <p className="text-xs text-muted-foreground">
                Notificação sonora para novas conversas ou mensagens.
              </p>
            </div>
            <Switch
              checked={soundEnabled()}
              onCheckedChange={(v) => {
                setSoundEnabled(v);
                if (v) play();
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2 flex-1 min-w-[120px]">
              <Label>Tipo de som</Label>
              <Select
                value={soundTone}
                onValueChange={(v) => {
                  setSoundTone(v as SoundTone);
                  setTone(v as SoundTone);
                }}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_TONE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={playPreview}
              title="Ouvir som"
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <Label>Reproduzir alertas quando:</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="alert-assigned-me" checked={alertsAssignedToMe} onCheckedChange={(c) => setAlertsAssignedToMe(!!c)} />
                <Label htmlFor="alert-assigned-me" className="font-normal cursor-pointer">Conversas atribuídas a mim</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="alert-unassigned" checked={alertsUnassigned} onCheckedChange={(c) => setAlertsUnassigned(!!c)} />
                <Label htmlFor="alert-unassigned" className="font-normal cursor-pointer">Conversas não atribuídas</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="alert-others" checked={alertsAssignedOthers} onCheckedChange={(c) => setAlertsAssignedOthers(!!c)} />
                <Label htmlFor="alert-others" className="font-normal cursor-pointer">Conversas atribuídas a outros</Label>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="alert-inactive" checked={alertsOnlyInactive} onCheckedChange={(c) => setAlertsOnlyInactive(!!c)} />
              <Label htmlFor="alert-inactive" className="font-normal cursor-pointer">
                Enviar alertas de áudio apenas se a janela do browser não estiver ativa
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="alert-30s" checked={alertsEvery30s} onCheckedChange={(c) => setAlertsEvery30s(!!c)} />
              <Label htmlFor="alert-30s" className="font-normal cursor-pointer">
                Enviar alertas a cada 30 segundos até todas as conversas serem lidas
              </Label>
            </div>
          </div>
        </section>

        {/* G. Notification Preferences */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Preferências de notificação</h2>
          <p className="text-sm text-muted-foreground">
            Configure como deseja receber notificações por e-mail e no browser.
          </p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Tipo de notificação</th>
                  <th className="text-left p-3 font-medium w-24">E-mail</th>
                  <th className="text-left p-3 font-medium w-24">Notificação</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_ROWS.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="p-3">{row.label}</td>
                    <td className="p-3">
                      <Checkbox
                        checked={notifPrefs[row.key]?.email ?? false}
                        onCheckedChange={(c) =>
                          setNotifPrefs((p) => ({
                            ...p,
                            [row.key]: { ...(p[row.key] ?? { email: false, push: false }), email: !!c },
                          }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      <Checkbox
                        checked={notifPrefs[row.key]?.push ?? false}
                        onCheckedChange={(c) =>
                          setNotifPrefs((p) => ({
                            ...p,
                            [row.key]: { ...(p[row.key] ?? { email: false, push: false }), push: !!c },
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <Label htmlFor="push-master" className="cursor-pointer">
              Ativar notificações push no browser
            </Label>
            <Switch
              id="push-master"
              checked={pushEnabled}
              onCheckedChange={(v) => {
                if (v) requestPushPermission();
                else setPushEnabled(false);
              }}
            />
          </div>
        </section>

        {/* H. Access Token — estilo Chatwoot */}
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Token de acesso</h2>
          <p className="text-sm text-muted-foreground">
            Utilizado para integrações via API (header <code className="text-xs bg-muted px-1 rounded">api_access_token</code>). Mantenha em segredo. Reiniciar invalida o token anterior.
          </p>
          <div className="flex gap-2">
            <Input
              value={apiToken ? '•'.repeat(36) : '••••••••••••••••••••••••••••••••'}
              readOnly
              className="font-mono bg-muted flex-1"
            />
            <Button variant="outline" size="icon" onClick={copyToken} title="Copiar token">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => resetToken.mutate()}
              disabled={resetToken.isPending || apiToken === undefined}
              title={apiToken === undefined ? 'Execute a migração 20260322230000 para reiniciar o token' : 'Reiniciar token'}
            >
              <RefreshCw className={`h-4 w-4 ${resetToken.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {apiToken === undefined && (
            <p className="text-xs text-muted-foreground">
              Token da sessão em uso. Para token dedicado estilo Chatwoot, execute a migração.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
