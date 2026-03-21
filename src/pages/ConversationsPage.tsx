import React, { useState, useRef, useEffect } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Plus, Send, Paperclip, MoreVertical, User, Clock,
  CheckCircle2, AlertCircle, MessageSquare, Filter, Hash, Inbox
} from 'lucide-react';

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
};

const ConversationsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageText, setMessageText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', currentOrg?.id, statusFilter],
    queryFn: async () => {
      if (!currentOrg) return [];
      let query = supabase
        .from('conversations')
        .select('*, contacts(name, email, phone, avatar_url), channels(name, channel_type)')
        .eq('organization_id', currentOrg.id)
        .order('last_message_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data } = await query;
      return data ?? [];
    },
    enabled: !!currentOrg,
    refetchInterval: 5000,
  });

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
    refetchInterval: 3000,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConvoId || !currentMember) return;
      await supabase.from('messages').insert({
        conversation_id: selectedConvoId,
        sender_type: 'agent',
        sender_id: currentMember.id,
        message_type: 'outgoing',
        content,
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selectedConvoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvoId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessageText('');
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim()) {
      sendMessage.mutate(messageText.trim());
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
          <div className="flex gap-1">
            {['open', 'pending', 'resolved', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {s === 'open' ? 'Abertas' : s === 'pending' ? 'Pendentes' : s === 'resolved' ? 'Resolvidas' : 'Todas'}
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
                      {statusIcons[convo.status]}
                      {convo.channels?.channel_type && (
                        <span className={`channel-badge ${channelColors[convo.channels.channel_type]}`}>
                          {channelLabels[convo.channels.channel_type] || convo.channels.channel_type}
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
            {/* Chat header */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {selectedConvo.contacts?.name?.charAt(0)?.toUpperCase() || <User className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {selectedConvo.contacts?.name || selectedConvo.subject || `Conversa #${selectedConvo.id.slice(0, 6)}`}
                  </p>
                  <div className="flex items-center gap-2">
                    {selectedConvo.channels?.channel_type && (
                      <span className={`channel-badge ${channelColors[selectedConvo.channels.channel_type]}`}>
                        {channelLabels[selectedConvo.channels.channel_type]}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{selectedConvo.status}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-3">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.message_type === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.message_type === 'outgoing'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : msg.message_type === 'note'
                        ? 'bg-priority-medium/10 text-foreground border border-priority-medium/20 rounded-bl-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    }`}
                  >
                    <p className="overflow-wrap-break-word">{msg.content}</p>
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

            {/* Message input */}
            <form onSubmit={handleSend} className="border-t bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="shrink-0">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Digite sua mensagem..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!messageText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
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
    </div>
  );
};

export default ConversationsPage;
