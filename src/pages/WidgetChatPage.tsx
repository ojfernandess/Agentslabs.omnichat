/**
 * Página pública do chat do widget Live Chat.
 * Usada dentro do iframe do painel (estilo Chatwoot).
 * Não requer autenticação — usa token do canal.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Loader2, MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  content: string | null;
  message_type: string;
  sender_type: string;
  created_at: string;
}

export default function WidgetChatPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const apiUrl = searchParams.get('api_url') || '';
  const prechatParam = searchParams.get('prechat_data');
  const existingConvId = searchParams.get('conversation_id');

  const [conversationId, setConversationId] = useState<string | null>(existingConvId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ welcome_title?: string; welcome_description?: string; site_name?: string; avatar_url?: string } | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseApi = apiUrl.replace(/\/$/, '');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Init: obter config e criar/buscar conversa
  useEffect(() => {
    if (!token) {
      setError('Token não informado');
      setLoading(false);
      return;
    }

    let prechat: Record<string, string> = {};
    if (prechatParam) {
      try {
        prechat = JSON.parse(decodeURIComponent(prechatParam));
      } catch {}
    }

    const init = async () => {
      try {
        const configRes = await fetch(`${baseApi}/get-widget-config?token=${encodeURIComponent(token)}`);
        if (configRes.ok) {
          const cfg = await configRes.json();
          setConfig(cfg);
          setAvatarError(false);
        }

        let convId = existingConvId;

        if (!convId) {
          const res = await fetch(`${baseApi}/widget-chat?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prechat: Object.keys(prechat).length ? prechat : undefined }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erro ao iniciar chat');
          }

          const data = await res.json();
          convId = data.conversation_id;
          setConversationId(convId);
        }

        const msgRes = await fetch(
          `${baseApi}/widget-chat?token=${encodeURIComponent(token)}&conversation_id=${encodeURIComponent(convId!)}`
        );
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao conectar');
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, baseApi, existingConvId]);

  // Polling de mensagens
  useEffect(() => {
    if (!conversationId || !token) return;

    const poll = () => {
      fetch(
        `${baseApi}/widget-chat?token=${encodeURIComponent(token)}&conversation_id=${encodeURIComponent(conversationId)}`
      )
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.messages) setMessages(data.messages);
        })
        .catch(() => {});
    };

    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [conversationId, token, baseApi]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !conversationId || !token || sending) return;

    setSending(true);
    setInput('');

    try {
      const res = await fetch(`${baseApi}/widget-chat?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, content: text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao enviar');
      }

      const msgRes = await fetch(
        `${baseApi}/widget-chat?token=${encodeURIComponent(token)}&conversation_id=${encodeURIComponent(conversationId)}`
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (e) {
      setInput(text);
      setError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  if (!token) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-background p-4">
        <p className="text-destructive">Token não informado.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3 bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Conectando...</p>
      </div>
    );
  }

  if (error && !conversationId) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-background p-4">
        <p className="text-center text-destructive">{error}</p>
      </div>
    );
  }

  const welcomeTitle = config?.welcome_title || 'Olá!';
  const welcomeDesc = config?.welcome_description || 'Como posso ajudar?';
  const siteName = config?.site_name || 'Suporte';
  const avatarUrl = config?.avatar_url;

  return (
    <div className="flex h-[400px] flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-3 py-2">
        {avatarUrl && !avatarError ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
        )}
        <span className="font-medium">{siteName}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">{welcomeTitle}</p>
            <p className="mt-1 text-muted-foreground">{welcomeDesc}</p>
          </div>
        )}
        {messages.map((m) => {
          const isOutgoing = m.message_type === 'outgoing';
          return (
            <div
              key={m.id}
              className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  isOutgoing
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p className="shrink-0 px-3 py-1 text-xs text-destructive">{error}</p>
      )}

      <form onSubmit={sendMessage} className="flex shrink-0 gap-2 border-t p-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
