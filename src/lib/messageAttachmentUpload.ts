import { supabase } from '@/integrations/supabase/client';
import { getUploadMediaUrl, useExternalMediaStorage } from '@/lib/runtimeEnv';

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
]);

export function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_BYTES) return 'Ficheiro demasiado grande (máx. 10 MB).';
  if (file.type.startsWith('image/')) return null;
  if (ALLOWED_MIME.has(file.type)) return null;
  return 'Tipo não permitido. Use imagem, PDF, áudio ou vídeo MP4.';
}

export type UploadedAttachment = {
  url: string;
  path: string;
  mime_type: string;
  file_name: string;
};

/** Upload para S3/MinIO (Easypanel) via Edge Function `upload-media`. */
async function uploadMessageAttachmentExternal(
  organizationId: string,
  conversationId: string,
  file: File,
): Promise<UploadedAttachment> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) throw new Error('Sessão expirada. Inicie sessão novamente.');

  const form = new FormData();
  form.append('kind', 'message');
  form.append('organization_id', organizationId);
  form.append('conversation_id', conversationId);
  form.append('file', file);

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const res = await fetch(getUploadMediaUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sess.session.access_token}`,
      ...(apikey ? { apikey } : {}),
    },
    body: form,
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
    url?: string;
    path?: string;
    mime_type?: string;
    file_name?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? body.detail ?? res.statusText ?? 'Falha no upload');
  }

  if (!body.url || !body.path) {
    throw new Error('Resposta inválida do servidor de mídia');
  }

  return {
    url: body.url,
    path: body.path,
    mime_type: body.mime_type || file.type || 'application/octet-stream',
    file_name: body.file_name || file.name,
  };
}

/** Upload para o bucket Supabase Storage (message-media) ou S3/MinIO conforme `VITE_EXTERNAL_MEDIA_STORAGE`. */
export async function uploadMessageAttachment(
  organizationId: string,
  conversationId: string,
  file: File
): Promise<UploadedAttachment> {
  const err = validateAttachmentFile(file);
  if (err) throw new Error(err);

  if (useExternalMediaStorage()) {
    return uploadMessageAttachmentExternal(organizationId, conversationId, file);
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.slice(0, 8) : 'bin';
  const path = `${organizationId}/${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from('message-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from('message-media').getPublicUrl(path);

  return {
    url: pub.publicUrl,
    path,
    mime_type: file.type || 'application/octet-stream',
    file_name: file.name,
  };
}

const AVATAR_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function uploadInboxAvatarExternal(organizationId: string, channelId: string, file: File): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) throw new Error('Sessão expirada. Inicie sessão novamente.');

  const form = new FormData();
  form.append('kind', 'inbox_avatar');
  form.append('organization_id', organizationId);
  form.append('channel_id', channelId);
  form.append('file', file);

  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const res = await fetch(getUploadMediaUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sess.session.access_token}`,
      ...(apikey ? { apikey } : {}),
    },
    body: form,
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  if (!body.url) throw new Error('Resposta inválida do servidor de mídia');
  return body.url;
}

/** Upload de avatar para inbox (widget). Bucket inbox-avatars ou S3 conforme `VITE_EXTERNAL_MEDIA_STORAGE`. */
export async function uploadInboxAvatar(
  organizationId: string,
  channelId: string,
  file: File
): Promise<string> {
  if (!AVATAR_ALLOWED.has(file.type)) {
    throw new Error('Use imagem PNG, JPG, GIF ou WebP.');
  }
  if (file.size > 2 * 1024 * 1024) throw new Error('Máximo 2 MB.');

  if (useExternalMediaStorage()) {
    return uploadInboxAvatarExternal(organizationId, channelId, file);
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().slice(0, 4) : 'jpg';
  const extMap: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
  const safeExt = extMap[ext] || 'jpg';
  const path = `${organizationId}/${channelId}-${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage.from('inbox-avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('inbox-avatars').getPublicUrl(path);
  return data.publicUrl;
}
