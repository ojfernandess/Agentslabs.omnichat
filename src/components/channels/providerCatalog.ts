import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  MessageCircle,
  Phone,
  Smartphone,
  Mail,
  Braces,
  Send,
  Instagram,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

export type DbChannelType = Database['public']['Enums']['channel_type'];

export type ProviderId =
  | DbChannelType
  | 'tiktok'
  | 'twitter'
  | 'google_business';

export type ChannelProvider = {
  id: ProviderId;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Se true, exibe badge "Em breve" e não abre wizard */
  comingSoon?: boolean;
  /** Tipos persistidos no banco; "virtuais" só para UI */
  dbType?: DbChannelType;
};

/** Seção 17.1 — grid de provedores (ordem próxima ao prompt) */
export const CHANNEL_PROVIDERS: ChannelProvider[] = [
  {
    id: 'livechat',
    name: 'Site (Live Chat)',
    description: 'Widget de chat ao vivo para o seu site',
    icon: Globe,
    dbType: 'livechat',
  },
  {
    id: 'messenger',
    name: 'Facebook',
    description: 'Conecte a página do Facebook (Messenger)',
    icon: MessageCircle,
    dbType: 'messenger',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Atenda clientes no WhatsApp Cloud API',
    icon: Phone,
    dbType: 'whatsapp',
  },
  {
    id: 'sms',
    name: 'SMS',
    description: 'Twilio, Zenvia, Vonage e outros',
    icon: Smartphone,
    dbType: 'sms',
  },
  {
    id: 'email',
    name: 'E-mail',
    description: 'Gmail, Outlook ou IMAP/SMTP',
    icon: Mail,
    dbType: 'email',
  },
  {
    id: 'api',
    name: 'API',
    description: 'Canal personalizado via API e webhooks',
    icon: Braces,
    dbType: 'api',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Bot API com webhook',
    icon: Send,
    dbType: 'telegram',
  },
  {
    id: 'line',
    name: 'LINE',
    description: 'Integração com canal LINE',
    icon: MessageCircle,
    dbType: 'line',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Mensagens diretas e menções',
    icon: Instagram,
    dbType: 'instagram',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Integração TikTok',
    icon: Globe,
    comingSoon: true,
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    description: 'Atendimento via DM',
    icon: MessageCircle,
    comingSoon: true,
  },
  {
    id: 'google_business',
    name: 'Google Business',
    description: 'Google Business Messages',
    icon: Globe,
    comingSoon: true,
  },
];

export function getProviderById(id: ProviderId): ChannelProvider | undefined {
  return CHANNEL_PROVIDERS.find((p) => p.id === id);
}
