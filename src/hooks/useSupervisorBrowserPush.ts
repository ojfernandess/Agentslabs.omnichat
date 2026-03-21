import { useEffect, useRef } from 'react';

/**
 * Notificações do sistema (Web Notifications API) quando o separador está em segundo plano.
 * Complementa o sininho na UI; requer permissão do utilizador (pedida uma vez).
 */
export function useSupervisorBrowserPush(enabled: boolean, unreadCount: number, title: string, body?: string) {
  const prevRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') return;
    if (unreadCount <= prevRef.current) {
      prevRef.current = unreadCount;
      return;
    }
    const delta = unreadCount - prevRef.current;
    prevRef.current = unreadCount;
    if (delta <= 0) return;

    if (Notification.permission === 'default') {
      void Notification.requestPermission();
      return;
    }
    if (Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

    try {
      new Notification(title, {
        body: body ?? `${delta} alerta(s) novo(s)`,
        tag: 'ops-notifications',
      });
    } catch {
      /* ignore */
    }
  }, [enabled, unreadCount, title, body]);
}
