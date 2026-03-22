import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { useSelectedConversation } from '@/contexts/SelectedConversationContext';
import { parseCsatSettings } from '@/lib/csatSettings';
import { getFunctionUrl } from '@/lib/runtimeEnv';
import {
  Search, Plus, Send, Paperclip, MoreVertical, User, Clock,
  CheckCircle2, AlertCircle, MessageSquare, Inbox, Star, RotateCcw,
  Moon, StickyNote, Copy, Check, RefreshCw, PanelRightClose,
  UserPlus, Mail, Trash2, Play, X, Building2, Phone, Pencil,
  Info, ExternalLink, Users, Tag, Mic, Square, FileText,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  const location = useLocation();
  const navigate = useNavigate();
  const { currentOrg, currentMember } = useOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { selectedConversationId: selectedConvoId, setSelectedConversationId: setSelectedConvoId } = useSelectedConversation();
  const [searchTerm, setSearchTerm] = useState('');
  const [messageText, setMessageText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeInput, setSnoozeInput] = useState('');
  const [noteMode, setNoteMode] = useState(false);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(false);
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
  const [unreadBalloonDismissed, setUnreadBalloonDismissed] = useState(false);
  const [executingMacroId, setExecutingMacroId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [addLabelsOpen, setAddLabelsOpen] = useState(false);
  const [contactNoteEditOpen, setContactNoteEditOpen] = useState(false);
  const [contactDeleteConfirmOpen, setContactDeleteConfirmOpen] = useState(false);
  const [contactNoteText, setContactNoteText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [composerModKey, setComposerModKey] = useState<'enter' | 'mod_enter'>(() => {
    try {
      const v = localStorage.getItem('agentslabs_composer_mod_key');
      return v === 'enter' ? 'enter' : 'mod_enter';
    } catch { return 'mod_enter'; }
  });
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', language: 'en', bodyParams: '' });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'agentslabs_composer_mod_key' && e.newValue) {
        setComposerModKey(e.newValue === 'enter' ? 'enter' : 'mod_enter');
      }
    };
    const onCustom = (e: Event) => {
      const v = (e as CustomEvent<string>).detail;
      if (v === 'enter' || v === 'mod_enter') setComposerModKey(v);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('composerModKeyChanged' as never, onCustom as never);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('composerModKeyChanged' as never, onCustom as never);
    };
  }, []);

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
    queryKey: ['conversations', currentOrg?.id, statusFilter, currentMember?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      let query = supabase
        .from('conversations')
        .select(
          `
          *,
          contacts(id, name, email, phone, company, notes, avatar_url, custom_fields),
          channels(name, channel_type, config),
          assignee:organization_members!conversations_assignee_id_fkey(id, display_name, avatar_url)
        `
        )
        .eq('organization_id', currentOrg.id)
        .order('last_message_at', { ascending: false });

      if (statusFilter === 'mine' && currentMember?.id) {
        query = query.eq('assignee_id', currentMember.id);
      } else if (statusFilter === 'unassigned') {
        query = query.is('assignee_id', null);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as Database['public']['Enums']['conversation_status']);
      }

      const { data, error } = await query;
      if (error) {
        const { data: fallback } = await supabase
          .from('conversations')
          .select('*, contacts(id, name, email, phone, company, notes, avatar_url, custom_fields), channels(name, channel_type, config)')
          .eq('organization_id', currentOrg.id)
          .order('last_message_at', { ascending: false });
        let rows = fallback ?? [];
        if (statusFilter === 'mine' && currentMember?.id) {
          rows = rows.filter((c: any) => c.assignee_id === currentMember.id);
        } else if (statusFilter === 'unassigned') {
          rows = rows.filter((c: any) => !c.assignee_id);
        } else if (statusFilter !== 'all') {
          rows = rows.filter((c) => c.status === statusFilter);
        }
        return rows;
      }
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  useEffect(() => {
    if (!selectedConvoId || !currentOrg) return;
    void (async () => {
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', selectedConvoId);
      queryClient.invalidateQueries({ queryKey: ['conversations', currentOrg.id] });
    })();
  }, [selectedConvoId, currentOrg?.id, queryClient]);

  const selectedConvo = conversations.find((c: any) => c.id === selectedConvoId);

  // Estado da navegação: Enviar Mensagem (Contatos) ou Ver detalhes (contactId)
  useEffect(() => {
    const state = location.state as { openNewMessage?: boolean; contactId?: string } | null;
    if (!state) return;
    if (state.openNewMessage) {
      setNewMessageOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (state.contactId) {
      const convo = conversations.find(
        (c: any) => c.contact_id === state.contactId || (c as any).contacts?.id === state.contactId
      );
      if (convo) {
        setSelectedConvoId(convo.id);
      } else {
        setNewMessageForm((prev) => ({ ...prev, selectedContactId: state.contactId!, contactSearch: '' }));
        setNewMessageOpen(true);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, conversations, navigate, setSelectedConvoId]);

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

  const updateContactNotes = useMutation({
    mutationFn: async ({ contactId, notes }: { contactId: string; notes: string }) => {
      const { error } = await supabase.from('contacts').update({ notes: notes || null }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setContactNoteEditOpen(false);
      toast.success('Nota atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error: convErr } = await supabase.from('conversations').delete().eq('contact_id', contactId);
      if (convErr) throw convErr;
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setContactDeleteConfirmOpen(false);
      setSelectedConvoId(null);
      toast.success('Contato excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Send message (ou nota privada — visível só à equipa, como no Chatwoot)
  const sendMessage = useMutation({
    mutationFn: async ({ content, asNote }: { content: string; asNote: boolean }) => {
      if (!selectedConvoId || !currentMember) return;
      const finalContent = !asNote && currentMember.message_signature?.trim()
        ? `${content.trim()}\n\n${currentMember.message_signature.trim()}`
        : content.trim();
      await supabase.from('messages').insert({
        conversation_id: selectedConvoId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: asNote ? 'note' : 'outgoing',
        content: finalContent,
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
          body: { conversation_id: selectedConvoId, content: finalContent },
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

  const isWhatsAppCloud = (() => {
    const ch = selectedConvo?.channels as { channel_type?: string; config?: Record<string, unknown> } | undefined;
    if (!ch || ch.channel_type !== 'whatsapp') return false;
    const cfg = (ch.config ?? {}) as Record<string, unknown>;
    const meta = (cfg.meta ?? {}) as Record<string, unknown>;
    const evolution = (cfg.evolution ?? {}) as Record<string, unknown>;
    const provider = String(cfg.whatsapp_provider ?? cfg.whatsappProvider ?? 'meta');
    const hasMeta = !!(meta.phone_number_id ?? meta.phoneNumberId) && !!(meta.access_token ?? meta.accessToken);
    const hasEvolution = !!(evolution.base_url ?? evolution.baseUrl ?? cfg.evolution_base_url) && !!(evolution.instance_name ?? evolution.instanceName ?? cfg.evolution_instance_name);
    return hasMeta && (provider === 'meta' || !hasEvolution);
  })();

  const startRecordingAudio = async () => {
    if (!selectedConvoId || !currentMember || !currentOrg) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        try {
          const up = await uploadMessageAttachment(currentOrg!.id, selectedConvoId!, file);
          await supabase.from('messages').insert({
            conversation_id: selectedConvoId,
            sender_type: 'agent',
            sender_id: currentMember!.id,
            message_type: 'outgoing',
            content: '🎤 Áudio',
            content_type: 'audio',
            attachments: [{ url: up.url, mime_type: up.mime_type, file_name: up.file_name, path: up.path }],
          });
          const { data: convoMeta } = await supabase.from('conversations').select('first_reply_at').eq('id', selectedConvoId).single();
          const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
          if (!convoMeta?.first_reply_at) patch.first_reply_at = new Date().toISOString();
          await supabase.from('conversations').update(patch).eq('id', selectedConvoId);
          const { error: sendErr } = await supabase.functions.invoke('send-outbound-message', {
            body: { conversation_id: selectedConvoId, content: '', content_type: 'audio', attachment_url: up.url },
          });
          if (sendErr) throw sendErr;
          queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          toast.success('Áudio enviado');
        } catch (err) {
          toast.error((err as Error).message || 'Falha ao enviar áudio');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      toast.error('Não foi possível aceder ao microfone');
    }
  };

  const stopRecordingAudio = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecordingAudio(false);
    }
  };

  const sendTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConvoId || !currentMember) return;
      const { name, language, bodyParams } = templateForm;
      if (!name.trim()) throw new Error('Nome do template obrigatório');
      const params = bodyParams.trim() ? bodyParams.split('\n').map((p) => p.trim()).filter(Boolean) : [];
      await supabase.from('messages').insert({
        conversation_id: selectedConvoId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: 'outgoing',
        content: `Template: ${name}${params.length ? ` (${params.join(', ')})` : ''}`,
        content_type: 'template',
      });
      const { data: convoMeta } = await supabase.from('conversations').select('first_reply_at').eq('id', selectedConvoId).single();
      const patch: Record<string, string> = { last_message_at: new Date().toISOString() };
      if (!convoMeta?.first_reply_at) patch.first_reply_at = new Date().toISOString();
      await supabase.from('conversations').update(patch).eq('id', selectedConvoId);
      const { error: sendErr } = await supabase.functions.invoke('send-outbound-message', {
        body: {
          conversation_id: selectedConvoId,
          content: '',
          content_type: 'template',
          template: { name: name.trim(), language: language.trim() || 'en', body_parameters: params },
        },
      });
      if (sendErr) throw sendErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setTemplateDialogOpen(false);
      setTemplateForm({ name: '', language: 'en', bodyParams: '' });
      toast.success('Template enviado');
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

  const { data: macros = [] } = useQuery({
    queryKey: ['macros', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('macros')
        .select('id, name, visibility, created_by')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg && !!selectedConvoId,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('teams')
        .select('id, name')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from('labels')
        .select('id, name, color')
        .eq('organization_id', currentOrg.id)
        .order('name');
      return data ?? [];
    },
    enabled: !!currentOrg,
  });

  const { data: previousConversations = [] } = useQuery({
    queryKey: ['previous-conversations', selectedConvo?.contact_id, selectedConvoId],
    queryFn: async () => {
      if (!selectedConvo?.contact_id || !currentOrg) return [];
      const { data } = await supabase
        .from('conversations')
        .select('id, subject, last_message_at, status, channels(name, channel_type)')
        .eq('organization_id', currentOrg.id)
        .eq('contact_id', selectedConvo.contact_id)
        .neq('id', selectedConvoId!)
        .order('last_message_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!selectedConvo?.contact_id && !!selectedConvoId && !!currentOrg,
  });

  const executeMacro = async (macroId: string) => {
    if (!selectedConvoId || !currentMember) return;
    setExecutingMacroId(macroId);
    try {
      const { data, error } = await supabase.functions.invoke('execute-macro', {
        body: { conversation_id: selectedConvoId, macro_id: macroId },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string };
      if (res?.error) throw new Error(res.error);
      toast.success('Macro executada');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Falha ao executar macro');
    } finally {
      setExecutingMacroId(null);
    }
  };

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

  const unreadConversations = conversations.filter((c: any) => (c.unread_count ?? 0) > 0);
  const unreadCount = unreadConversations.length;

  const prevUnreadRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) setUnreadBalloonDismissed(false);
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

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
    const content = messageText.trim();
    setMessageText(''); // Limpar imediatamente (estilo Chatwoot)
    sendMessage.mutate({ content, asNote: noteMode });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    submitComposer();
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    const mod = (() => {
      try {
        const v = localStorage.getItem('agentslabs_composer_mod_key');
        return v === 'enter' ? 'enter' : 'mod_enter';
      } catch { return 'mod_enter'; }
    })();
    if (mod === 'enter') {
      if (e.shiftKey) return; // Shift+Enter = newline
      e.preventDefault();
      submitComposer();
      return;
    }
    // mod_enter: Cmd/Ctrl+Enter = send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitComposer();
    }
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
        const res = await fetch(getFunctionUrl('send-csat-survey'), {
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
        const isAudio = file.type.startsWith('audio/');
        await supabase.from('messages').insert({
          conversation_id: selectedConvoId,
          sender_type: 'agent',
          sender_id: currentMember.id,
          message_type: 'outgoing',
          content: isAudio ? '🎤 Áudio' : `📎 ${up.file_name}`,
          content_type: isAudio ? 'audio' : 'file',
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
        if (isAudio) {
          const { error: sendErr } = await supabase.functions.invoke('send-outbound-message', {
            body: { conversation_id: selectedConvoId, content: '', content_type: 'audio', attachment_url: up.url },
          });
          if (sendErr) {
            const msg = (sendErr as { context?: { body?: { error?: string } } })?.context?.body?.error ?? sendErr.message;
            throw new Error(msg || 'Falha ao enviar áudio para o canal.');
          }
        }
        queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        toast.success(isAudio ? 'Áudio enviado' : 'Ficheiro enviado');
        return;
      }

      const dataUrl = await compressImageFileForUpload(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) {
        toast.error('Sessão expirada');
        return;
      }
      const res = await fetch(getFunctionUrl('process-media'), {
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

        {unreadCount > 0 && !unreadBalloonDismissed && (
          <div className="mx-2 mt-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 shadow-md">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => {
                const first = unreadConversations[0];
                if (first) setSelectedConvoId(first.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const first = unreadConversations[0];
                  if (first) setSelectedConvoId(first.id);
                }
              }}
              aria-label="Ver primeira conversa não lida"
            >
              <p className="text-sm font-medium text-foreground">
                {unreadCount === 1
                  ? '1 conversa com mensagens não lidas'
                  : `${unreadCount} conversas com mensagens não lidas`}
              </p>
              <p className="text-xs text-muted-foreground">
                Clique para ver a primeira
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Fechar aviso"
              onClick={(e) => {
                e.stopPropagation();
                setUnreadBalloonDismissed(true);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

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
                } ${convo.unread_count > 0 ? 'border-l-4 border-l-primary/60 bg-primary/5' : ''}`}
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
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-pulse">
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
      <div className="flex-1 flex min-w-0 relative">
        <div className="flex-1 flex flex-col min-w-0 relative">
        {selectedConvo ? (
          <>
            {/* Ícone flutuante — alternar painel de detalhes do contato */}
            {selectedConvo.contacts && (
              <Button
                variant="secondary"
                size="icon"
                className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full shadow-lg border bg-card hover:bg-muted transition-all hover:scale-105"
                onClick={() => setContactSidebarOpen((o) => !o)}
                title={contactSidebarOpen ? 'Recolher detalhes do contato' : 'Ver detalhes do contato'}
              >
                {contactSidebarOpen ? (
                  <PanelRightClose className="h-5 w-5" />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </Button>
            )}
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
                          if (a.url && (a.mime_type?.startsWith('audio/') || msg.content_type === 'audio')) {
                            return (
                              <audio
                                key={idx}
                                controls
                                src={a.url}
                                className="max-w-full h-10"
                              />
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
                      : composerModKey === 'enter'
                        ? 'Escreva a resposta. Enter para enviar. Shift+Enter para nova linha.'
                        : 'Escreva a resposta. Cmd/Ctrl+Enter para enviar.'
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
                    {!noteMode && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 shrink-0 ${isRecordingAudio ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}
                        title={isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}
                        onClick={isRecordingAudio ? stopRecordingAudio : startRecordingAudio}
                      >
                        {isRecordingAudio ? (
                          <Square className="h-4 w-4 fill-current" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {!noteMode && isWhatsAppCloud && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        title="Enviar template WhatsApp"
                        onClick={() => setTemplateDialogOpen(true)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="hidden text-[10px] text-muted-foreground sm:inline">
                      {composerModKey === 'enter' ? 'Enter para enviar' : 'Ctrl+Enter para enviar'}
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

            {/* Dialog template WhatsApp Cloud */}
            <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) setTemplateForm({ name: '', language: 'en', bodyParams: '' }); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Enviar template WhatsApp</DialogTitle>
                  <DialogDescription>
                    Envie uma mensagem template (24h após última mensagem do contacto). Nome do template conforme aprovado no Meta Business.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template-name">Nome do template</Label>
                    <Input
                      id="template-name"
                      placeholder="ex: hello_world ou confirmacao_pedido"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-lang">Código do idioma</Label>
                    <Input
                      id="template-lang"
                      placeholder="en ou pt_BR"
                      value={templateForm.language}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, language: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-params">Parâmetros do body (um por linha)</Label>
                    <Textarea
                      id="template-params"
                      placeholder={'Parâmetro 1\nParâmetro 2'}
                      value={templateForm.bodyParams}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, bodyParams: e.target.value }))}
                      rows={3}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={() => sendTemplateMutation.mutate()}
                    disabled={!templateForm.name.trim() || sendTemplateMutation.isPending}
                  >
                    Enviar template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Inbox className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1">Escolha uma conversa ao lado ou crie uma nova</p>
          </div>
        )}
        </div>

        {/* Contact sidebar — colapsável (toggle via ícone flutuante) */}
        {selectedConvo?.contacts && (
          <div
            className={`hidden lg:flex shrink-0 flex-col border-l bg-card overflow-y-auto transition-[width] duration-200 ${
              contactSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
            }`}
          >
            {contactSidebarOpen && (
            <>
            {/* Detalhes do contato — estilo Chatwoot */}
            <div className="p-4 border-b space-y-3">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted overflow-hidden shrink-0 ring-2 ring-border">
                    {contactAvatar ? (
                      <img src={contactAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-semibold text-muted-foreground">
                        {selectedConvo.contacts.name?.charAt(0)?.toUpperCase() ?? <User className="h-10 w-10" />}
                      </span>
                    )}
                  </div>
                  {isWhatsApp && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full shadow"
                      onClick={async () => {
                        try {
                          const { data, isError } = await refetchProfile();
                          queryClient.invalidateQueries({ queryKey: ['conversations'] });
                          if (isError) return;
                          if (data?.profilePictureUrl) toast.success('Foto atualizada');
                          else toast.info('Sem foto no WhatsApp');
                        } catch {
                          toast.error('Falha ao verificar');
                        }
                      }}
                      disabled={profileLoading}
                      title="Atualizar foto WhatsApp"
                    >
                      <RefreshCw className={`h-3 w-3 ${profileLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
                <div className="w-full text-center space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <p className="font-semibold text-sm truncate">{selectedConvo.contacts.name || 'Sem nome'}</p>
                    <Link to={`/contacts?id=${selectedConvo.contacts.id}`} className="text-muted-foreground hover:text-foreground" title="Ver contato">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <div
                      className="flex items-center justify-center gap-2 cursor-pointer hover:text-foreground"
                      onClick={() => selectedConvo.contacts.email && copyToClipboard('email', selectedConvo.contacts.email)}
                      title={selectedConvo.contacts.email ? 'Clique para copiar' : undefined}
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      {selectedConvo.contacts.email ? (
                        <span className="truncate">{selectedConvo.contacts.email}</span>
                      ) : (
                        <span>Indisponível</span>
                      )}
                      {selectedConvo.contacts.email && (copiedField === 'email' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />)}
                    </div>
                    <div
                      className="flex items-center justify-center gap-2 cursor-pointer hover:text-foreground"
                      onClick={() => (selectedConvo.contacts.phone || waId) && copyToClipboard('phone', selectedConvo.contacts.phone || waId || '')}
                      title={selectedConvo.contacts.phone || waId ? 'Clique para copiar' : undefined}
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      {selectedConvo.contacts.phone || waId ? (
                        <span className="font-mono truncate">{selectedConvo.contacts.phone || waId}</span>
                      ) : (
                        <span>Indisponível</span>
                      )}
                      {(selectedConvo.contacts.phone || waId) && (copiedField === 'phone' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />)}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span>{(selectedConvo.contacts as { company?: string })?.company || 'Indisponível'}</span>
                    </div>
                  </div>
                </div>
                {/* Barra de ações — estilo Chatwoot */}
                <div className="flex gap-1 w-full justify-center">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      setNewMessageForm({
                        contactSearch: selectedConvo?.contacts?.name ?? '',
                        selectedContactId: selectedConvo?.contact_id ?? null,
                        channelId: selectedConvo?.channel_id ?? '',
                        message: '',
                      });
                      setNewMessageOpen(true);
                    }}
                    title="Nova mensagem"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                  <Link to={`/contacts?id=${selectedConvo.contacts.id}`}>
                    <Button variant="outline" size="icon" className="h-9 w-9" title="Editar contato">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setContactDeleteConfirmOpen(true)}
                    title="Excluir contato"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Seções em accordion */}
            <div className="flex-1 overflow-y-auto">
              <Accordion type="multiple" defaultValue={['conversation-actions', 'macros', 'contact-attributes', 'contact-notes']} className="px-2">
                {/* Ações da conversa */}
                <AccordionItem value="conversation-actions">
                  <AccordionTrigger className="text-sm py-3">Ações da conversa</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Agente atribuído</Label>
                      <Select
                        value={selectedConvo.assignee_id ?? 'none'}
                        onValueChange={(v) => patchConversation.mutate({ id: selectedConvo.id, patch: { assignee_id: v === 'none' ? null : v } })}
                      >
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {orgMembers.map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>{m.display_name || m.id?.slice(0, 8)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Time atribuído</Label>
                      <Select
                        value={selectedConvo.team_id ?? 'none'}
                        onValueChange={(v) => patchConversation.mutate({ id: selectedConvo.id, patch: { team_id: v === 'none' ? null : v } })}
                      >
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {teams.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Prioridade</Label>
                      <Select
                        value={selectedConvo.priority ?? 'none'}
                        onValueChange={(v) => patchConversation.mutate({ id: selectedConvo.id, patch: { priority: v } })}
                      >
                        <SelectTrigger className="h-9 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PRIORITY_LABELS) as [string, string][]).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Etiquetas da conversa</Label>
                      <Popover open={addLabelsOpen} onOpenChange={setAddLabelsOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full mt-1 justify-start gap-2">
                            <Tag className="h-3.5 w-3.5" />
                            + Adicionar etiquetas
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2">
                          {labels.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">Nenhuma etiqueta configurada</p>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {labels
                                .filter((l: any) => !(selectedConvo.tags ?? []).includes(l.name))
                                .map((l: any) => (
                                  <Button
                                    key={l.id}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs"
                                    onClick={() => {
                                      const next = [...(selectedConvo.tags ?? []), l.name];
                                      patchConversation.mutate({ id: selectedConvo.id, patch: { tags: next } });
                                      setAddLabelsOpen(false);
                                    }}
                                  >
                                    <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: l.color || '#3B82F6' }} />
                                    {l.name}
                                  </Button>
                                ))}
                              {(selectedConvo.tags ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-2 border-t mt-2">
                                  {(selectedConvo.tags as string[]).map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-[10px]">
                                      {tag}
                                      <button
                                        type="button"
                                        className="ml-1 hover:text-destructive"
                                        onClick={() => {
                                          const next = (selectedConvo.tags ?? []).filter((t: string) => t !== tag);
                                          patchConversation.mutate({ id: selectedConvo.id, patch: { tags: next } });
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      {(selectedConvo.tags?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(selectedConvo.tags as string[]).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Macros */}
                <AccordionItem value="macros">
                  <AccordionTrigger className="text-sm py-3">Macros</AccordionTrigger>
                  <AccordionContent>
                    {(macros as { id: string; name: string; visibility?: string; created_by?: string }[])
                      .filter((m) => m.visibility !== 'private' || m.created_by === currentMember?.user_id)
                      .length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma macro disponível</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(macros as { id: string; name: string; visibility?: string; created_by?: string }[])
                          .filter((m) => m.visibility !== 'private' || m.created_by === currentMember?.user_id)
                          .map((m) => (
                            <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                              <span className="text-xs truncate">{m.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => executeMacro(m.id)}
                                disabled={executingMacroId === m.id}
                                title="Executar macro"
                              >
                                <Play className={`h-3.5 w-3.5 ${executingMacroId === m.id ? 'animate-pulse' : ''}`} />
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Informação da conversa */}
                <AccordionItem value="conversation-info">
                  <AccordionTrigger className="text-sm py-3">Informação da conversa</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {selectedConvo.channels && (
                        <p>Canal: {selectedConvo.channels.name || channelLabels[selectedConvo.channels.channel_type] || selectedConvo.channels.channel_type}</p>
                      )}
                      <p>Criada em {new Date(selectedConvo.created_at).toLocaleString('pt-BR')}</p>
                      <p>Status: {STATUS_LABELS[selectedConvo.status] ?? selectedConvo.status}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Atributos do contato */}
                <AccordionItem value="contact-attributes">
                  <AccordionTrigger className="text-sm py-3">Atributos do contato</AccordionTrigger>
                  <AccordionContent>
                    {(selectedConvo.contacts as { custom_fields?: Record<string, unknown> })?.custom_fields &&
                    Object.keys((selectedConvo.contacts.custom_fields as Record<string, unknown>) ?? {}).length > 0 ? (
                      <div className="space-y-2 text-xs">
                        {Object.entries((selectedConvo.contacts.custom_fields as Record<string, unknown>) ?? {}).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3 py-1 border-b border-dashed last:border-0">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="truncate text-right">{String(v ?? '')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum atributo encontrado</p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Notas do contato */}
                <AccordionItem value="contact-notes">
                  <AccordionTrigger className="text-sm py-3">Notas do contato</AccordionTrigger>
                  <AccordionContent>
                    {(selectedConvo.contacts as { notes?: string })?.notes ? (
                      <p className="text-xs whitespace-pre-wrap mb-2">{(selectedConvo.contacts as { notes?: string }).notes}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-2">Ainda não há notas. Use o botão abaixo para criar uma.</p>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-primary text-xs"
                      onClick={() => {
                        setContactNoteText((selectedConvo.contacts as { notes?: string })?.notes ?? '');
                        setContactNoteEditOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar nota de contato
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                {/* Conversas anteriores */}
                {previousConversations.length > 0 && (
                  <AccordionItem value="previous-conversations">
                    <AccordionTrigger className="text-sm py-3">Conversas anteriores</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {previousConversations.map((pc: any) => (
                          <button
                            key={pc.id}
                            type="button"
                            className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                            onClick={() => setSelectedConvoId(pc.id)}
                          >
                            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{pc.subject || 'Conversa'}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {pc.channels?.channel_type && channelLabels[pc.channels.channel_type]} • {pc.last_message_at ? new Date(pc.last_message_at).toLocaleDateString('pt-BR') : ''}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Participantes da conversa */}
                <AccordionItem value="participants">
                  <AccordionTrigger className="text-sm py-3">Participantes da conversa</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-xs text-muted-foreground">
                      {selectedConvo.assignee_id ? '1 agente atribuído.' : 'Nenhum agente atribuído.'}
                    </p>
                    {selectedConvo.assignee && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex h-6 w-6 rounded-full bg-primary/10 items-center justify-center text-[10px] font-medium">
                          {selectedConvo.assignee.display_name?.charAt(0) || '?'}
                        </div>
                        <span className="text-xs">{selectedConvo.assignee.display_name}</span>
                        {selectedConvo.assignee_id === currentMember?.id && (
                          <span className="text-[10px] text-muted-foreground">(você)</span>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            </>
            )}

            {/* Dialog editar nota do contato */}
            <Dialog open={contactNoteEditOpen} onOpenChange={(open) => { setContactNoteEditOpen(open); if (!open) setContactNoteText(''); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nota do contato</DialogTitle>
                  <DialogDescription>Informações visíveis apenas à equipa.</DialogDescription>
                </DialogHeader>
                <Textarea
                  rows={4}
                  value={contactNoteText}
                  onChange={(e) => setContactNoteText(e.target.value)}
                  placeholder="Adicione uma nota sobre este contato..."
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setContactNoteEditOpen(false)}>Cancelar</Button>
                  <Button
                    onClick={() => selectedConvo?.contacts?.id && updateContactNotes.mutate({ contactId: selectedConvo.contacts.id, notes: contactNoteText })}
                    disabled={updateContactNotes.isPending}
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog confirmar exclusão do contato */}
            <AlertDialog open={contactDeleteConfirmOpen} onOpenChange={setContactDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir contato e histórico</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir <strong>{selectedConvo?.contacts?.name || 'este contato'}</strong>? Todas as conversas e o histórico de mensagens serão removidos permanentemente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => selectedConvo?.contacts?.id && deleteContactMutation.mutate(selectedConvo.contacts.id)}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
