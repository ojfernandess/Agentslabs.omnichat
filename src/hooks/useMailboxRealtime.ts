import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Atualizações em tempo real via Supabase Realtime (Postgres Changes).
 * Não usa Socket.io: o mesmo efeito (baixa latência vs polling) com o mesmo projeto Supabase.
 */
export function useMailboxRealtime(
  organizationId: string | undefined,
  selectedConversationId: string | null,
  options?: { onNewMessage?: (conversationId: string) => void }
) {
  const queryClient = useQueryClient();
  const onNewMessageRef = useRef(options?.onNewMessage);
  onNewMessageRef.current = options?.onNewMessage;

  useEffect(() => {
    if (!organizationId) return;
    const ch: RealtimeChannel = supabase.channel(`mailbox:${organizationId}`);

    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        queryClient.invalidateQueries({ queryKey: ['conversations', organizationId] });
        queryClient.invalidateQueries({ queryKey: ['inbox-unread-count', organizationId] });
        if (!payload.new || !onNewMessageRef.current) return;
        const row = payload.new as { id?: string; unread_count?: number };
        const convId = row.id;
        const unread = row.unread_count ?? 0;
        if (!convId || unread === 0) return;
        const shouldNotify =
          (payload.eventType === 'INSERT' && unread > 0) ||
          (payload.eventType === 'UPDATE' && convId !== selectedConversationId && unread > 0);
        if (shouldNotify) onNewMessageRef.current(convId);
      }
    );

    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'organization_members',
        filter: `organization_id=eq.${organizationId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ['team-members', organizationId] });
      }
    );

    ch.subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [organizationId, queryClient, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const ch = supabase.channel(`messages:${selectedConversationId}`);

    ch.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConversationId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations', organizationId] });
      }
    );

    ch.subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [selectedConversationId, organizationId, queryClient]);
}
