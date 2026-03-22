import { supabase } from '@/integrations/supabase/client';

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

/** Upload para o bucket Supabase Storage (message-media). */
export async function uploadMessageAttachment(
  organizationId: string,
  conversationId: string,
  file: File
): Promise<UploadedAttachment> {
  const err = validateAttachmentFile(file);
  if (err) throw new Error(err);

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

/** Upload de avatar para inbox (widget). Bucket inbox-avatars. */
export async function uploadInboxAvatar(
  organizationId: string,
  channelId: string,
  file: File
): Promise<string> {
  if (!AVATAR_ALLOWED.has(file.type)) {
    throw new Error('Use imagem PNG, JPG, GIF ou WebP.');
  }
  if (file.size > 2 * 1024 * 1024) throw new Error('Máximo 2 MB.');

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
