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
import { toast } from 'sonner';
import { compressImageFileForUpload } from '@/lib/mediaClient';
import { uploadMessageAttachment } from '@/lib/messageAttachmentUpload';
import { useMailboxRealtime } from '@/hooks/useMailboxRealtime';
import { parseCsatSettings } from '@/lib/csatSettings';
import {
  Search, Plus, Send, Paperclip, MoreVertical, User, Clock,
  CheckCircle2, AlertCircle, MessageSquare, Inbox, Star, RotateCcw,
  Moon, StickyNote, Copy, Check, RefreshCw, PanelRightClose, PanelRightOpen,
  UserPlus, Mail, Trash2,
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
import { Checkbox } from '@/components/ui/checkbox';
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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(true);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [newMessageForm, setNewMessageForm] = useState({
    contactSearch: '',
    selectedContactId: null as string | null,
    channelId: '',
    message: '',
  });
  const [deleteConvoId, setDeleteConvoId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
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
          contacts(name, email, phone, avatar_url, custom_fields),
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
          .select('*, contacts(name, email, phone, avatar_url, custom_fields), channels(name, channel_type)')
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

  const isWhatsApp =
    selectedConvo?.channels?.channel_type === 'whatsapp' &&
    selectedConvo?.contact_id &&
    selectedConvo?.channel_id;

  const { data: profilePic, refetch: refetchProfile, isFetching: profileLoading } = useQuery({
    queryKey: ['whatsapp-profile', selectedConvo?.contact_id, selectedConvo?.channel_id],
    queryFn: async () => {
      if (!selectedConvo?.contact_id || !selectedConvo?.channel_id) return null;
      const { data, error } = await supabase.functions.invoke('fetch-whatsapp-profile', {
        body: { contact_id: selectedConvo.contact_id, channel_id: selectedConvo.channel_id },
      });
      if (error) throw error;
      return (data as { profilePictureUrl?: string | null; wuid?: string | null }) ?? null;
    },
    enabled: !!isWhatsApp,
    staleTime: 5 * 60 * 1000,
  });

  const contactAvatar =
    profilePic?.profilePictureUrl ||
    selectedConvo?.contacts?.avatar_url ||
    null;

  const waId =
    selectedConvo?.contacts?.phone
      ? selectedConvo.contacts.phone.replace(/\D/g, '') + '@s.whatsapp.net'
      : profilePic?.wuid ?? null;

  const copyToClipboard = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      toast.success('Copiado');
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

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

      if (!asNote) {
        const { error: sendErr } = await supabase.functions.invoke('send-outbound-message', {
          body: { conversation_id: selectedConvoId, content: content.trim() },
        });
        if (sendErr) {
          const msg = (sendErr as { context?: { body?: { error?: string } } })?.context?.body?.error ?? sendErr.message;
          throw new Error(msg || 'Falha ao enviar para o canal (WhatsApp).');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessageText('');
      setNoteMode(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create new conversation (sem contacto/canal — legado)
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

  const { data: contactsForMessage = [] } = useQuery({
    queryKey: ['contacts-newmessage', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('contacts')
        .select('id, name, email, phone')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg && newMessageOpen,
  });

  const { data: channelsForMessage = [] } = useQuery({
    queryKey: ['channels-newmessage', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('channels')
        .select('id, name, channel_type')
        .eq('organization_id', currentOrg.id)
        .eq('is_active', true)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg && newMessageOpen,
  });

  const createContact = useMutation({
    mutationFn: async () => {
      if (!currentOrg) return;
      await supabase.from('contacts').insert({
        organization_id: currentOrg.id,
        name: addContactForm.name.trim(),
        email: addContactForm.email.trim() || null,
        phone: addContactForm.phone.trim() || null,
        company: addContactForm.company.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-newmessage'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setAddContactOpen(false);
      setAddContactForm({ name: '', email: '', phone: '', company: '' });
      toast.success('Contato adicionado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNewMessage = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !currentMember) return null;
      const { selectedContactId, channelId, message } = newMessageForm;
      if (!selectedContactId || !channelId || !message.trim()) {
        throw new Error('Selecione contato, caixa de entrada e escreva a mensagem');
      }
      const contact = contactsForMessage.find((c: { id: string }) => c.id === selectedContactId);
      if (!contact?.phone && !contact?.email) {
        throw new Error('O contato precisa de telefone ou e-mail para enviar mensagem');
      }
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', currentOrg.id)
        .eq('channel_id', channelId)
        .eq('contact_id', selectedContactId)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let conversationId: string;
      if (existing?.id) {
        conversationId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({
            organization_id: currentOrg.id,
            channel_id: channelId,
            contact_id: selectedContactId,
            status: 'open',
            subject: contact?.name || 'Nova conversa',
            assignee_id: currentMember.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        conversationId = created!.id;
      }
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: 'outgoing',
        content: message.trim(),
      });
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        first_reply_at: supabase.rpc ? null : undefined,
      }).eq('id', conversationId);
      const { data: convoMeta } = await supabase
        .from('conversations')
        .select('first_reply_at')
        .eq('id', conversationId)
        .single();
      const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
      if (!convoMeta?.first_reply_at) {
        patch.first_reply_at = new Date().toISOString();
      }
      await supabase.from('conversations').update(patch).eq('id', conversationId);
      const { error: sendErr } = await supabase.functions.invoke('send-outbound-message', {
        body: { conversation_id: conversationId, content: message.trim() },
      });
      if (sendErr) {
        throw new Error((sendErr as { message?: string }).message || 'Falha ao enviar');
      }
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setNewMessageOpen(false);
      setNewMessageForm({ contactSearch: '', selectedContactId: null, channelId: '', message: '' });
      if (conversationId) setSelectedConvoId(conversationId);
      toast.success('Mensagem enviada');
    },
    onError: (e: Error) => toast.error(e.message),
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

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setDeleteConvoId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedConvoId === id) setSelectedConvoId(null);
      toast.success('Conversa excluída');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao excluir'),
  });

  const bulkDeleteConversations = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from('conversations').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedIds(new Set());
      if (ids.includes(selectedConvoId ?? '')) setSelectedConvoId(null);
      toast.success(`${ids.length} conversa(s) excluída(s)`);
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao excluir'),
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAddContactOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Adicionar contato
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewMessageOpen(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar mensagem
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          {filteredConversations.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                id="select-all-convos"
                checked={selectedIds.size === filteredConversations.length && filteredConversations.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedIds(new Set(filteredConversations.map((c: any) => c.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              />
              <label htmlFor="select-all-convos" className="cursor-pointer text-muted-foreground">
                Selecionar todas
              </label>
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-muted/50 text-sm">
            <span className="text-muted-foreground">{selectedIds.size} selecionada(s)</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Desmarcar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDeleteConversations.isPending}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filteredConversations.map((convo: any) => (
              <div
                key={convo.id}
                onClick={() => setSelectedConvoId(convo.id)}
                className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 cursor-pointer flex items-start gap-3 ${
                  selectedConvoId === convo.id ? 'bg-muted' : ''
                }`}
              >
                <Checkbox
                  checked={selectedIds.has(convo.id)}
                  onCheckedChange={(checked) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(convo.id);
                      else next.delete(convo.id);
                      return next;
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Selecionar ${convo.contacts?.name || convo.id}`}
                />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium shrink-0 overflow-hidden">
                  {convo.contacts?.avatar_url ? (
                    <img src={convo.contacts.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    convo.contacts?.name?.charAt(0)?.toUpperCase() || <User className="h-4 w-4" />
                  )}
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
            ))
          )}
        </div>
      </div>

      {/* Chat area + Contact sidebar */}
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col min-w-0">
        {selectedConvo ? (
          <>
            {/* Cabeçalho (caixa, estado, prioridade, atribuição — modelo Chatwoot) */}
            <div className="border-b bg-card px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium shrink-0 overflow-hidden">
                    {contactAvatar ? (
                      <img src={contactAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      selectedConvo.contacts?.name?.charAt(0)?.toUpperCase() || <User className="h-4 w-4" />
                    )}
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
                  <DropdownMenuItem
                    onSelect={() => setDeleteConvoId(selectedConvo.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir conversa
                  </DropdownMenuItem>
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

        {/* Contact sidebar — colapsável */}
        {selectedConvo?.contacts && (
          <div
            className={`hidden lg:flex shrink-0 flex-col border-l bg-card overflow-y-auto transition-[width] ${
              contactSidebarOpen ? 'w-72' : 'w-14'
            }`}
          >
            <div
              className={`flex items-center gap-2 min-h-[52px] ${
                contactSidebarOpen ? 'p-4 border-b justify-between' : 'p-2 justify-center'
              }`}
            >
              {contactSidebarOpen ? (
                <>
                  <h3 className="text-sm font-semibold">Contatos</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setContactSidebarOpen(false)}
                    title="Recolher painel"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setContactSidebarOpen(true)}
                  title="Expandir painel de contatos"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </Button>
              )}
            </div>

            {contactSidebarOpen && (
            <>
            <div className="p-4 border-b">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted overflow-hidden shrink-0">
                    {contactAvatar ? (
                      <img src={contactAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-medium text-muted-foreground">
                        {selectedConvo.contacts.name?.charAt(0)?.toUpperCase() || <User className="h-8 w-8" />}
                      </span>
                    )}
                  </div>
                  {isWhatsApp && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                      onClick={async () => {
                        try {
                          const { data, isError } = await refetchProfile();
                          queryClient.invalidateQueries({ queryKey: ['conversations'] });
                          if (isError) return;
                          if (data?.profilePictureUrl) toast.success('Foto do WhatsApp atualizada');
                          else toast.info('Contato sem foto de perfil no WhatsApp');
                        } catch {
                          toast.error('Falha ao verificar contato');
                        }
                      }}
                      disabled={profileLoading}
                      title="Verificar contato (atualizar foto WhatsApp)"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${profileLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
                <div className="w-full text-center">
                  <p className="font-medium truncate">{selectedConvo.contacts.name || '—'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Indisponível</p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 space-y-4 text-sm">
              {selectedConvo.contacts.email && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">E-mail</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{selectedConvo.contacts.email}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard('email', selectedConvo.contacts.email)}
                    >
                      {copiedField === 'email' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
              {selectedConvo.contacts.phone && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Telefone</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono">{selectedConvo.contacts.phone}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard('phone', selectedConvo.contacts.phone)}
                    >
                      {copiedField === 'phone' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
              {waId && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">WhatsApp ID</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{waId}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard('wa', waId)}
                    >
                      {copiedField === 'wa' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {(selectedConvo.tags?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
                    {(selectedConvo.tags as string[]).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(selectedConvo.contacts as { custom_fields?: Record<string, unknown> })?.custom_fields &&
                Object.keys((selectedConvo.contacts.custom_fields as Record<string, unknown>) ?? {}).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Atributos do contato</p>
                  <div className="space-y-1.5 text-xs">
                    {Object.entries(
                      (selectedConvo.contacts.custom_fields as Record<string, unknown>) ?? {}
                    ).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="truncate">{String(v ?? '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!selectedConvo.contacts?.custom_fields ||
                Object.keys((selectedConvo.contacts.custom_fields as Record<string, unknown>) ?? {}).length === 0) && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Atributos do contato</p>
                  <p className="text-xs text-muted-foreground">Nenhum atributo encontrado</p>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* Adicionar contato */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar contato</DialogTitle>
            <DialogDescription>Preencha os dados do novo contato.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createContact.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="add-name">Nome</Label>
              <Input
                id="add-name"
                value={addContactForm.name}
                onChange={(e) => setAddContactForm({ ...addContactForm, name: e.target.value })}
                placeholder="Nome do contato"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">E-mail</Label>
              <Input
                id="add-email"
                type="email"
                value={addContactForm.email}
                onChange={(e) => setAddContactForm({ ...addContactForm, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-phone">Telefone</Label>
              <Input
                id="add-phone"
                value={addContactForm.phone}
                onChange={(e) => setAddContactForm({ ...addContactForm, phone: e.target.value })}
                placeholder="+55 11 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-company">Empresa</Label>
              <Input
                id="add-company"
                value={addContactForm.company}
                onChange={(e) => setAddContactForm({ ...addContactForm, company: e.target.value })}
                placeholder="Nome da empresa"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddContactOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createContact.isPending}>
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Enviar mensagem — modelo Chatwoot */}
      <Dialog
        open={newMessageOpen}
        onOpenChange={(v) => {
          setNewMessageOpen(v);
          if (!v) setNewMessageForm({ contactSearch: '', selectedContactId: null, channelId: '', message: '' });
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova mensagem</DialogTitle>
            <DialogDescription>Selecione o contato e a caixa de entrada para enviar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Para:</Label>
              <div className="relative">
                <Input
                  placeholder="Pesquisar um contato pelo nome, e-mail ou número de telefone"
                  value={
                    newMessageForm.selectedContactId
                      ? (contactsForMessage.find((c: { id: string }) => c.id === newMessageForm.selectedContactId) as { name?: string; email?: string; phone?: string })?.name ||
                        (contactsForMessage.find((c: { id: string }) => c.id === newMessageForm.selectedContactId) as { email?: string })?.email ||
                        (contactsForMessage.find((c: { id: string }) => c.id === newMessageForm.selectedContactId) as { phone?: string })?.phone ||
                        ''
                      : newMessageForm.contactSearch
                  }
                  onChange={(e) => {
                    setNewMessageForm({ ...newMessageForm, contactSearch: e.target.value });
                    if (newMessageForm.selectedContactId) setNewMessageForm((f) => ({ ...f, selectedContactId: null }));
                  }}
                  onFocus={() => {
                    if (newMessageForm.selectedContactId) {
                      const c = contactsForMessage.find((x: { id: string }) => x.id === newMessageForm.selectedContactId) as { name?: string; email?: string; phone?: string } | undefined;
                      setNewMessageForm({ ...newMessageForm, selectedContactId: null, contactSearch: c?.name || c?.email || c?.phone || '' });
                    }
                  }}
                />
                {!newMessageForm.selectedContactId && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
                    {(() => {
                      const filtered = (contactsForMessage as Array<{ id: string; name?: string; email?: string; phone?: string }>)
                        .filter((c) => {
                          const q = newMessageForm.contactSearch.toLowerCase();
                          if (!q) return true;
                          return (
                            c.name?.toLowerCase().includes(q) ||
                            c.email?.toLowerCase().includes(q) ||
                            c.phone?.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
                          );
                        })
                        .slice(0, 8);
                      if (filtered.length > 0) {
                        return filtered.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() =>
                              setNewMessageForm({
                                ...newMessageForm,
                                selectedContactId: c.id,
                                contactSearch: c.name || c.email || c.phone || '',
                              })
                            }
                          >
                            <span className="font-medium">{c.name || '—'}</span>
                            {(c.email || c.phone) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {[c.email, c.phone].filter(Boolean).join(' • ')}
                              </span>
                            )}
                          </button>
                        ));
                      }
                      if (contactsForMessage.length === 0) {
                        return <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum contato. Adicione um em Adicionar contato.</p>;
                      }
                      if (newMessageForm.contactSearch.length >= 1) {
                        return <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum contato encontrado.</p>;
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Via:</Label>
              <Select
                value={newMessageForm.channelId || 'none'}
                onValueChange={(v) => setNewMessageForm({ ...newMessageForm, channelId: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mostrar Caixas de Entrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione a caixa</SelectItem>
                  {(channelsForMessage as Array<{ id: string; name: string; channel_type?: string }>).map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      <span className="flex items-center gap-2">
                        {ch.name}
                        {ch.channel_type && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {channelLabels[ch.channel_type] ?? ch.channel_type}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Escreva sua mensagem aqui..."
                value={newMessageForm.message}
                onChange={(e) => setNewMessageForm({ ...newMessageForm, message: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (newMessageForm.selectedContactId && newMessageForm.channelId && newMessageForm.message.trim()) {
                      sendNewMessage.mutate();
                    }
                  }
                }}
                rows={5}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewMessageOpen(false);
                  setNewMessageForm({ contactSearch: '', selectedContactId: null, channelId: '', message: '' });
                }}
              >
                Descartar
              </Button>
              <Button
                onClick={() => sendNewMessage.mutate()}
                disabled={
                  !newMessageForm.selectedContactId ||
                  !newMessageForm.channelId ||
                  !newMessageForm.message.trim() ||
                  sendNewMessage.isPending
                }
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar (↵)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(v) => !v && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} conversa(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as mensagens das conversas selecionadas serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ids = Array.from(selectedIds);
                bulkDeleteConversations.mutate(ids);
                setBulkDeleteOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConvoId} onOpenChange={(v) => !v && setDeleteConvoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as mensagens da conversa serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConvoId && deleteConversation.mutate(deleteConvoId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConversationsPage;
