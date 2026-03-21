import React, { useState, useRef, useEffect } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { compressImageFileForUpload } from '@/lib/mediaClient';
import { uploadMessageAttachment } from '@/lib/messageAttachmentUpload';
import { useMailboxRealtime } from '@/hooks/useMailboxRealtime';
import { parseCsatSettings } from '@/lib/csatSettings';
import {
  Search, Plus, Send, Paperclip, MoreVertical, User, Clock,
  CheckCircle2, AlertCircle, MessageSquare, Inbox, Star, RotateCcw,
  Moon, StickyNote,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  FILTER_TABS,
  PRIORITY_LABELS,
  STATUS_HELP,
  STATUS_LABELS,
  snoozeAtPreset,
  type ConversationPriority,
  type ConversationStatus,
} from '@/lib/chatwootConversation';
import type { Database } from '@/integrations/supabase/types';

const channelColors: Record<string, string> = {
  whatsapp: 'channel-whatsapp',
  messenger: 'channel-messenger',
  instagram: 'channel-instagram',
  telegram: 'channel-telegram',
  email: 'channel-email',
  livechat: 'channel-livechat',
  sms: 'channel-sms',
};

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  telegram: 'Telegram',
  email: 'E-mail',
  livechat: 'Live Chat',
  sms: 'SMS',
};

const statusIcons: Record<string, React.ReactNode> = {
  open: <AlertCircle className="h-3 w-3 text-status-away" />,
  pending: <Clock className="h-3 w-3 text-priority-medium" />,
  resolved: <CheckCircle2 className="h-3 w-3 text-status-online" />,
  snoozed: <Moon className="h-3 w-3 text-violet-500" />,
};

const ConversationsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageText, setMessageText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeInput, setSnoozeInput] = useState('');
  const [noteMode, setNoteMode] = useState(false);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [composerModKey, setComposerModKey] = useState<'⌘' | 'Ctrl'>('Ctrl');

  const { data: orgMembers = [] } = useQuery({
    queryKey: ['org-members-select', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('id, display_name, role')
        .eq('organization_id', currentOrg.id)
        .order('display_name');
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  // Fetch conversations (atribuição + caixa, estilo Chatwoot)
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', currentOrg?.id, statusFilter],
    queryFn: async () => {
      if (!currentOrg) return [];
      let query = supabase
        .from('conversations')
        .select(
          `
          *,
          contacts(name, email, phone, avatar_url),
          channels(name, channel_type),
          assignee:organization_members!conversations_assignee_id_fkey(id, display_name)
        `
        )
        .eq('organization_id', currentOrg.id)
        .order('last_message_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as Database['public']['Enums']['conversation_status']);
      }

      const { data, error } = await query;
      if (error) {
        const { data: fallback } = await supabase
          .from('conversations')
          .select('*, contacts(name, email, phone, avatar_url), channels(name, channel_type)')
          .eq('organization_id', currentOrg.id)
          .order('last_message_at', { ascending: false });
        let rows = fallback ?? [];
        if (statusFilter !== 'all') {
          rows = rows.filter((c) => c.status === statusFilter);
        }
        return rows;
      }
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  useMailboxRealtime(currentOrg?.id, selectedConvoId);

  useEffect(() => {
    if (!selectedConvoId || !currentOrg) return;
    void (async () => {
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', selectedConvoId);
      queryClient.invalidateQueries({ queryKey: ['conversations', currentOrg.id] });
    })();
  }, [selectedConvoId, currentOrg?.id, queryClient]);

  const selectedConvo = conversations.find((c: any) => c.id === selectedConvoId);

  // Fetch messages for selected conversation
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedConvoId],
    queryFn: async () => {
      if (!selectedConvoId) return [];
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConvoId)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!selectedConvoId,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setComposerModKey(/Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl');
  }, []);

  useEffect(() => {
    const el = messageTextareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const h = Math.min(Math.max(el.scrollHeight, 88), 220);
    el.style.height = `${h}px`;
  }, [messageText]);

  useEffect(() => {
    if (!snoozeOpen) return;
    setSnoozeInput(snoozeAtPreset('1h'));
  }, [snoozeOpen]);

  const patchConversation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const { error } = await supabase.from('conversations').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Send message (ou nota privada — visível só à equipa, como no Chatwoot)
  const sendMessage = useMutation({
    mutationFn: async ({ content, asNote }: { content: string; asNote: boolean }) => {
      if (!selectedConvoId || !currentMember) return;
      await supabase.from('messages').insert({
        conversation_id: selectedConvoId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: asNote ? 'note' : 'outgoing',
        content,
        is_private: asNote,
      });
      const { data: convoMeta } = await supabase
        .from('conversations')
        .select('first_reply_at')
        .eq('id', selectedConvoId)
        .single();
      const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
      if (!convoMeta?.first_reply_at) {
        patch.first_reply_at = new Date().toISOString();
      }
      await supabase.from('conversations').update(patch).eq('id', selectedConvoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessageText('');
      setNoteMode(false);
    },
  });

  // Create new conversation
  const createConversation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      const { data } = await supabase
        .from('conversations')
        .insert({
          organization_id: currentOrg.id,
          status: 'open',
          subject: 'Nova conversa',
          assignee_id: currentMember?.id,
        })
        .select()
        .single();
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (data) setSelectedConvoId(data.id);
    },
  });

  const filteredConversations = conversations.filter((c: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.contacts?.name?.toLowerCase().includes(term) ||
      c.contacts?.email?.toLowerCase().includes(term) ||
      c.subject?.toLowerCase().includes(term)
    );
  });

  const submitComposer = () => {
    if (!messageText.trim()) return;
    sendMessage.mutate({ content: messageText.trim(), asNote: noteMode });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    submitComposer();
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return;
    e.preventDefault();
    submitComposer();
  };

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      score,
      csatEnabled,
    }: {
      id: string;
      score: number | null;
      csatEnabled: boolean;
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          snoozed_until: null,
          satisfaction_score: csatEnabled ? null : score,
        })
        .eq('id', id);
      if (error) throw error;
      if (csatEnabled) {
        const { data: sessionData } = await supabase.auth.getSession();
        const jwt = sessionData.session?.access_token;
        if (!jwt) throw new Error('Sessão expirada');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(`${supabaseUrl}/functions/v1/send-csat-survey`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversation_id: id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((j as { error?: string }).error || 'Falha ao enviar inquérito CSAT');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setResolveOpen(false);
      setCsatScore(null);
      toast.success('Conversa resolvida');
      if (statusFilter === 'open') {
        setSelectedConvoId(null);
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao resolver'),
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase
        .from('conversations')
        .select('custom_attributes')
        .eq('id', id)
        .single();
      const prev = (row?.custom_attributes ?? {}) as Record<string, unknown>;
      const attrs = { ...prev, csat_pending: false };
      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'open',
          custom_attributes: attrs,
          resolved_at: null,
          snoozed_until: null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa reaberta');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao reabrir'),
  });

  const csatOrg = parseCsatSettings(currentOrg?.settings);

  const confirmResolve = () => {
    if (!selectedConvoId || !currentOrg) return;
    resolveMutation.mutate({
      id: selectedConvoId,
      score: csatScore,
      csatEnabled: csatOrg.enabled,
    });
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (noteMode) {
      toast.info('Anexos só estão disponíveis em mensagens ao contacto (como no Chatwoot).');
      return;
    }
    if (!file || !currentOrg || !selectedConvoId || !currentMember) return;
    try {
      if (!file.type.startsWith('image/')) {
        const up = await uploadMessageAttachment(currentOrg.id, selectedConvoId, file);
        await supabase.from('messages').insert({
          conversation_id: selectedConvoId,
          sender_type: 'agent',
          sender_id: currentMember.id,
          message_type: 'outgoing',
          content: `📎 ${up.file_name}`,
          content_type: 'file',
          attachments: [
            { url: up.url, mime_type: up.mime_type, file_name: up.file_name, path: up.path },
          ],
        });
        const { data: convoMeta } = await supabase
          .from('conversations')
          .select('first_reply_at')
          .eq('id', selectedConvoId)
          .single();
        const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
        if (!convoMeta?.first_reply_at) patch.first_reply_at = new Date().toISOString();
        await supabase.from('conversations').update(patch).eq('id', selectedConvoId);
        queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        toast.success('Ficheiro enviado');
        return;
      }

      const dataUrl = await compressImageFileForUpload(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) {
        toast.error('Sessão expirada');
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/process-media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: currentOrg.id,
          image_base64: dataUrl,
        }),
      });
      const media = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((media as { error?: string }).error || 'Falha ao processar imagem');
      }
      const m = media as {
        thumb_url: string;
        full_url: string;
        thumb_path?: string;
      };
      await supabase.from('messages').insert({
        conversation_id: selectedConvoId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: 'outgoing',
        content: '📷 Imagem',
        content_type: 'image',
        attachments: [
          { thumb_url: m.thumb_url, full_url: m.full_url, thumb_path: m.thumb_path ?? null },
        ],
      });
      const { data: convoMeta } = await supabase
        .from('conversations')
        .select('first_reply_at')
        .eq('id', selectedConvoId)
        .single();
      const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
      if (!convoMeta?.first_reply_at) {
        patch.first_reply_at = new Date().toISOString();
      }
      await supabase.from('conversations').update(patch).eq('id', selectedConvoId);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Imagem enviada');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 lg:w-96 border-r flex flex-col bg-card shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversas</h2>
            <Button size="icon" variant="ghost" onClick={() => createConversation.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filteredConversations.map((convo: any) => (
              <button
                key={convo.id}
                onClick={() => setSelectedConvoId(convo.id)}
                className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${
                  selectedConvoId === convo.id ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium shrink-0">
                    {convo.contacts?.name?.charAt(0)?.toUpperCase() || <User className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {convo.contacts?.name || convo.subject || `#${convo.id.slice(0, 6)}`}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {convo.last_message_at ? new Date(convo.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {statusIcons[convo.status] ?? statusIcons.open}
                      {convo.channels?.channel_type && (
                        <span className={`channel-badge ${channelColors[convo.channels.channel_type]}`}>
                          {channelLabels[convo.channels.channel_type] || convo.channels.channel_type}
                        </span>
                      )}
                      {convo.assignee?.display_name && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                          → {convo.assignee.display_name}
                        </span>
                      )}
                      {convo.unread_count > 0 && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {convo.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selectedConvo ? (
          <>
            {/* Cabeçalho (caixa, estado, prioridade, atribuição — modelo Chatwoot) */}
            <div className="border-b bg-card px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium shrink-0">
                    {selectedConvo.contacts?.name?.charAt(0)?.toUpperCase() || <User className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {selectedConvo.contacts?.name || selectedConvo.subject || `Conversa #${selectedConvo.id.slice(0, 6)}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {selectedConvo.channels?.channel_type && (
                        <span className={`channel-badge ${channelColors[selectedConvo.channels.channel_type]}`}>
                          {channelLabels[selectedConvo.channels.channel_type]}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                        {STATUS_LABELS[selectedConvo.status as ConversationStatus] ?? selectedConvo.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {PRIORITY_LABELS[selectedConvo.priority as ConversationPriority] ?? selectedConvo.priority}
                      </Badge>
                      {selectedConvo.status === 'resolved' && selectedConvo.satisfaction_score != null && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-current" />
                          {selectedConvo.satisfaction_score}/5
                        </span>
                      )}
                      {selectedConvo.status === 'snoozed' && selectedConvo.snoozed_until && (
                        <span className="text-[10px] text-muted-foreground">
                          até {new Date(selectedConvo.snoozed_until).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Acções da conversa">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {selectedConvo.status !== 'resolved' ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setCsatScore(null);
                        setResolveOpen(true);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Resolver conversa…
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onSelect={() => reopenMutation.mutate(selectedConvo.id)}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reabrir conversa
                      </DropdownMenuItem>
                      {selectedConvo.satisfaction_score != null && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          CSAT registado: {selectedConvo.satisfaction_score}/5
                        </div>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1 min-w-[130px]">
                  <Label className="text-[10px] text-muted-foreground">Atribuído a</Label>
                  <Select
                    value={selectedConvo.assignee_id ?? 'none'}
                    onValueChange={(v) =>
                      patchConversation.mutate({
                        id: selectedConvo.id,
                        patch: { assignee_id: v === 'none' ? null : v },
                      })
                    }
                    disabled={patchConversation.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Agente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não atribuído</SelectItem>
                      {orgMembers.map((m: { id: string; display_name: string | null }) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.display_name || m.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-[120px]">
                  <Label className="text-[10px] text-muted-foreground">Estado</Label>
                  <Select
                    value={selectedConvo.status}
                    onValueChange={(v) => {
                      if (v === 'resolved') {
                        setCsatScore(null);
                        setResolveOpen(true);
                        return;
                      }
                      if (v === 'snoozed') {
                        setSnoozeOpen(true);
                        return;
                      }
                      const patch: Record<string, unknown> = {
                        status: v as ConversationStatus,
                        snoozed_until: null,
                        resolved_at: null,
                      };
                      if (selectedConvo.status === 'resolved') {
                        const prev = (selectedConvo.custom_attributes ?? {}) as Record<string, unknown>;
                        patch.custom_attributes = { ...prev, csat_pending: false };
                      }
                      patchConversation.mutate({
                        id: selectedConvo.id,
                        patch,
                      });
                    }}
                    disabled={patchConversation.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as ConversationStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-[110px]">
                  <Label className="text-[10px] text-muted-foreground">Prioridade</Label>
                  <Select
                    value={selectedConvo.priority}
                    onValueChange={(v) =>
                      patchConversation.mutate({
                        id: selectedConvo.id,
                        patch: { priority: v as ConversationPriority },
                      })
                    }
                    disabled={patchConversation.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_LABELS) as ConversationPriority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedConvo.status !== 'resolved' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSnoozeOpen(true)}
                  >
                    <Moon className="h-3.5 w-3.5 mr-1" />
                    Adiar
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {STATUS_HELP[selectedConvo.status as ConversationStatus]}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-3">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.message_type === 'outgoing'
                      ? 'justify-end'
                      : msg.message_type === 'activity'
                      ? 'justify-center'
                      : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.message_type === 'outgoing'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : msg.message_type === 'note'
                        ? 'bg-priority-medium/10 text-foreground border border-priority-medium/20 rounded-bl-md'
                        : msg.message_type === 'activity'
                        ? 'bg-violet-500/10 text-foreground border border-violet-500/20 rounded-md text-xs'
                        : 'bg-muted text-foreground rounded-bl-md'
                    }`}
                  >
                    {msg.content && (
                      <p className="overflow-wrap-break-word whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(
                          msg.attachments as Array<{
                            thumb_url?: string;
                            full_url?: string;
                            url?: string;
                            mime_type?: string;
                            file_name?: string;
                          }>
                        ).map((a, idx) => {
                          const imgSrc = a.thumb_url || (a.url && a.mime_type?.startsWith('image/') ? a.url : null);
                          if (imgSrc) {
                            return (
                              <a
                                key={idx}
                                href={a.full_url || a.url || a.thumb_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={imgSrc}
                                  alt=""
                                  className="rounded-lg max-h-44 max-w-[min(100%,280px)] object-cover border border-white/10"
                                />
                              </a>
                            );
                          }
                          if (a.url) {
                            return (
                              <a
                                key={idx}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline break-all"
                              >
                                {a.file_name || 'Abrir ficheiro'}
                              </a>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                    <p className={`text-[10px] mt-1 ${
                      msg.message_type === 'outgoing' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer (paridade com Chatwoot: multi-linha, nota privada, atalho enviar) */}
            <form onSubmit={handleSend} className="border-t bg-card px-4 py-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,video/mp4,audio/*,.doc,.docx"
                className="hidden"
                onChange={handleFileAttach}
              />
              <div
                className={`rounded-xl border shadow-sm transition-colors ${
                  noteMode
                    ? 'border-amber-500/35 bg-amber-500/[0.06]'
                    : 'border-border bg-muted/25'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {noteMode ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        <StickyNote className="h-3.5 w-3.5 shrink-0" />
                        Nota privada — visível só à equipa
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Resposta ao contacto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="note-mode"
                      className="cursor-pointer text-[10px] text-muted-foreground whitespace-nowrap"
                    >
                      Nota interna
                    </Label>
                    <Switch
                      checked={noteMode}
                      onCheckedChange={setNoteMode}
                      id="note-mode"
                      aria-label="Alternar nota privada"
                    />
                  </div>
                </div>
                <Textarea
                  ref={messageTextareaRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    noteMode
                      ? 'Nota interna — não é enviada ao contacto; só a equipa vê no histórico.'
                      : 'Escreva a resposta ao contacto. Nova linha: Enter. Enviar: botão ou atalho na barra abaixo.'
                  }
                  rows={3}
                  className="min-h-[88px] max-h-[220px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2 py-1.5 sm:px-3">
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      disabled={noteMode}
                      title={
                        noteMode
                          ? 'Anexos desativados em modo nota'
                          : 'Anexar ficheiro'
                      }
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="hidden text-[10px] text-muted-foreground sm:inline">
                      {composerModKey}+Enter para enviar
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {messageText.length}
                    </span>
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 gap-1.5 px-3"
                      disabled={!messageText.trim() || sendMessage.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Enviar
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Inbox className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1">Escolha uma conversa ao lado ou crie uma nova</p>
          </div>
        )}
      </div>

      <Dialog
        open={resolveOpen}
        onOpenChange={(v) => {
          setResolveOpen(v);
          if (!v) setCsatScore(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver conversa</DialogTitle>
            <DialogDescription>
              {csatOrg.enabled ? (
                <>
                  A pesquisa de satisfação (CSAT) está activa nas configurações. Ao confirmar, a conversa fica
                  resolvida e o cliente recebe a mensagem de avaliação (WhatsApp, se o canal estiver configurado).
                  A nota final virá da resposta do cliente (1 a 5).
                </>
              ) : (
                <>
                  Opcional: registe uma nota interna de satisfação (1–5) para o Analytics, ou deixe em branco para
                  resolver sem nota.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {!csatOrg.enabled && (
            <>
              <div className="flex flex-wrap justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCsatScore(csatScore === n ? null : n)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                      csatScore === n
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'border-muted hover:border-amber-500/50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {csatScore == null ? 'Sem nota — apenas resolver' : `Nota interna: ${csatScore}/5`}
              </p>
            </>
          )}
          {csatOrg.enabled && (
            <p className="text-sm text-muted-foreground py-2">
              Edite o texto do inquérito em <strong>Configurações → Geral → CSAT</strong>.
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmResolve} disabled={resolveMutation.isPending}>
              {csatOrg.enabled ? 'Resolver e enviar inquérito' : 'Resolver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adiar conversa</DialogTitle>
            <DialogDescription>
              Como no Chatwoot: a conversa fica em estado «adiada» até à data ou até o contacto enviar mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSnoozeInput(snoozeAtPreset('1h'))}
              >
                +1 h
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSnoozeInput(snoozeAtPreset('tomorrow'))}
              >
                Amanhã 9h
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSnoozeInput(snoozeAtPreset('week'))}
              >
                +7 dias
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="snooze-until">Reactivar após</Label>
              <Input
                id="snooze-until"
                type="datetime-local"
                value={snoozeInput}
                onChange={(e) => setSnoozeInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSnoozeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!selectedConvoId || !snoozeInput) return;
                const iso = new Date(snoozeInput).toISOString();
                patchConversation.mutate(
                  {
                    id: selectedConvoId,
                    patch: { status: 'snoozed', snoozed_until: iso },
                  },
                  {
                    onSuccess: () => {
                      setSnoozeOpen(false);
                      toast.success('Conversa adiada');
                    },
                  }
                );
              }}
              disabled={!snoozeInput || patchConversation.isPending}
            >
              Adiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConversationsPage;
