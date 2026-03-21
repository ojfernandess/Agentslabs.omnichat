import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Atualizações em tempo real via Supabase Realtime (Postgres Changes).
 * Não usa Socket.io: o mesmo efeito (baixa latência vs polling) com o mesmo projeto Supabase.
 */
export function useMailboxRealtime(
  organizationId: string | undefined,
  selectedConversationId: string | null
) {
  const queryClient = useQueryClient();

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
      () => {
        queryClient.invalidateQueries({ queryKey: ['conversations', organizationId] });
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
  }, [organizationId, queryClient]);

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
