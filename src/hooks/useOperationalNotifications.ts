import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  MISSING_TABLE_STORAGE_KEYS,
  isMissingRestTableError,
  readMissingTableFlag,
  setMissingTableFlag,
  clearMissingTableFlag,
} from '@/lib/supabaseMissingTable';

export type OperationalNotificationRow = {
  id: string;
  organization_id: string;
  notification_type: string;
  severity: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const STORAGE_KEY = MISSING_TABLE_STORAGE_KEYS.operationalNotifications;

export function useOperationalNotifications(
  organizationId: string | undefined,
  enabled: boolean
) {
  const [items, setItems] = useState<OperationalNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const tableMissingRef = useRef(readMissingTableFlag(STORAGE_KEY));

  const applyRows = useCallback((rows: OperationalNotificationRow[]) => {
    setItems(rows);
    setUnreadCount(rows.filter((r) => !r.read_at).length);
  }, []);

  const load = useCallback(async () => {
    if (!organizationId || !enabled || tableMissingRef.current || readMissingTableFlag(STORAGE_KEY)) return;
    const { data, error } = await supabase
      .from('operational_notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (isMissingRestTableError(error)) {
        tableMissingRef.current = true;
        setMissingTableFlag(STORAGE_KEY);
        applyRows([]);
        return;
      }
      console.error('operational_notifications:', error);
      return;
    }
    clearMissingTableFlag(STORAGE_KEY);
    tableMissingRef.current = false;
    applyRows((data ?? []) as OperationalNotificationRow[]);
  }, [organizationId, enabled, applyRows]);

  useEffect(() => {
    tableMissingRef.current = readMissingTableFlag(STORAGE_KEY);
    if (tableMissingRef.current) applyRows([]);
  }, [organizationId, applyRows]);

  useEffect(() => {
    if (!organizationId || !enabled) {
      applyRows([]);
      return;
    }

    if (readMissingTableFlag(STORAGE_KEY)) {
      tableMissingRef.current = true;
      applyRows([]);
      return;
    }

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    (async () => {
      const { data, error } = await supabase
        .from('operational_notifications')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (error) {
        if (isMissingRestTableError(error)) {
          tableMissingRef.current = true;
          setMissingTableFlag(STORAGE_KEY);
          applyRows([]);
          return;
        }
        console.error('operational_notifications:', error);
        return;
      }

      clearMissingTableFlag(STORAGE_KEY);
      tableMissingRef.current = false;
      applyRows((data ?? []) as OperationalNotificationRow[]);

      ch = supabase
        .channel(`operational_notifications:${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'operational_notifications',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            void load();
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (ch) supabase.removeChannel(ch);
    };
  }, [organizationId, enabled, applyRows, load]);

  const markRead = async (id: string) => {
    if (tableMissingRef.current || readMissingTableFlag(STORAGE_KEY)) return;
    await supabase.from('operational_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    await load();
  };

  const markAllRead = async () => {
    if (!organizationId || tableMissingRef.current || readMissingTableFlag(STORAGE_KEY)) return;
    await supabase
      .from('operational_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .is('read_at', null);
    await load();
  };

  return { items, unreadCount, refresh: load, markRead, markAllRead };
}
