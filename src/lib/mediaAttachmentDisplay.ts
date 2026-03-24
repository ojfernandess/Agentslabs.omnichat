/** Resolve a URL to use in <img src> for message attachments (thumb, signed, public URL, mime, message type). */
export function getAttachmentImageSrc(
  a: {
    thumb_url?: string | null;
    full_url?: string | null;
    signed_url?: string | null;
    url?: string | null;
    mime_type?: string | null;
    file_name?: string | null;
  },
  messageContentType?: string | null,
): string | null {
  if (a.thumb_url) return a.thumb_url;
  const mt = (a.mime_type ?? '').toLowerCase();
  const isImageMime = mt.startsWith('image/');
  const isMsgImage = messageContentType === 'image';
  const fn = (a.file_name ?? '').toLowerCase();
  const looksLikeImageExt = /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(fn);
  if (!isImageMime && !isMsgImage && !looksLikeImageExt) return null;
  return a.signed_url || a.full_url || a.url || null;
}

/** Best link target for opening the attachment in a new tab. */
export function getAttachmentOpenHref(a: {
  full_url?: string | null;
  signed_url?: string | null;
  url?: string | null;
  thumb_url?: string | null;
}): string | null {
  return a.full_url || a.signed_url || a.url || a.thumb_url || null;
}
