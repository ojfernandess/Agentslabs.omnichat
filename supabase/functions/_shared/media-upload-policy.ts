/**
 * Política de anexos de mensagem — referência + testes Deno.
 * Manter em sync com upload-media/index.ts e media-presign/index.ts (deploy não empacota _shared).
 */
export const LEGACY_MAX_BYTES = 10 * 1024 * 1024;

export const STRICT_IMAGE_MAX = 10 * 1024 * 1024;
export const STRICT_AUDIO_MAX = 50 * 1024 * 1024;
export const STRICT_VIDEO_MAX = 500 * 1024 * 1024;
export const STRICT_PDF_MAX = 10 * 1024 * 1024;

const LEGACY_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
]);

export function isLegacyModeFromEnv(envGetter: (k: string) => string | undefined): boolean {
  const v = envGetter("MEDIA_LEGACY_ATTACHMENTS")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function maxBytesForMessageMime(contentType: string, legacy: boolean): number {
  if (legacy) return LEGACY_MAX_BYTES;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (
    ct === "image/jpeg" ||
    ct === "image/png" ||
    ct === "image/gif" ||
    ct === "image/webp" ||
    ct === "application/pdf"
  ) {
    return ct === "application/pdf" ? STRICT_PDF_MAX : STRICT_IMAGE_MAX;
  }
  if (ct === "audio/mpeg" || ct === "audio/wav" || ct === "audio/wave" || ct === "audio/x-wav") {
    return STRICT_AUDIO_MAX;
  }
  if (ct === "video/mp4" || ct === "video/webm") return STRICT_VIDEO_MAX;
  return 0;
}

export function isAllowedMessageMimeType(contentType: string, legacy: boolean): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (legacy) {
    if (ct.startsWith("image/")) return true;
    return LEGACY_ALLOWED.has(ct);
  }
  return maxBytesForMessageMime(ct, false) > 0;
}

/** Validação best-effort de assinatura de ficheiro (anti-extensão enganadora). */
export function validateMessageFileMagic(contentType: string, buf: Uint8Array, legacy: boolean): string | null {
  if (legacy) return null;
  if (buf.length < 4) return null;
  const ct = contentType.split(";")[0].trim().toLowerCase();

  const u8 = (i: number) => buf[i] ?? 0;

  if (ct === "image/jpeg") {
    if (u8(0) !== 0xff || u8(1) !== 0xd8 || u8(2) !== 0xff) return "Conteúdo não corresponde a JPEG";
    return null;
  }
  if (ct === "image/png") {
    if (u8(0) !== 0x89 || u8(1) !== 0x50 || u8(2) !== 0x4e || u8(3) !== 0x47) return "Conteúdo não corresponde a PNG";
    return null;
  }
  if (ct === "image/webp") {
    if (u8(0) !== 0x52 || u8(1) !== 0x49 || u8(2) !== 0x46 || u8(3) !== 0x46) return "Conteúdo não corresponde a WebP (RIFF)";
    const tag = String.fromCharCode(u8(8), u8(9), u8(10), u8(11));
    if (tag !== "WEBP") return "Conteúdo não corresponde a WebP";
    return null;
  }
  if (ct === "image/gif") {
    if (buf.length < 6) return null;
    const sig = String.fromCharCode(u8(0), u8(1), u8(2), u8(3), u8(4), u8(5));
    if (sig !== "GIF87a" && sig !== "GIF89a") return "Conteúdo não corresponde a GIF";
    return null;
  }
  if (ct === "audio/mpeg") {
    if (buf.length >= 3 && u8(0) === 0xff && (u8(1) & 0xe0) === 0xe0) return null;
    if (buf.length >= 3 && u8(0) === 0x49 && u8(1) === 0x44 && u8(2) === 0x33) return null;
    return "Conteúdo não corresponde a MP3";
  }
  if (ct === "audio/wav" || ct === "audio/wave" || ct === "audio/x-wav") {
    if (u8(0) !== 0x52 || u8(1) !== 0x49 || u8(2) !== 0x46 || u8(3) !== 0x46) return "Conteúdo não corresponde a WAV";
    return null;
  }
  if (ct === "video/mp4") {
    let ok = false;
    for (let i = 0; i <= Math.min(buf.length - 8, 32); i++) {
      if (u8(i + 4) === 0x66 && u8(i + 5) === 0x74 && u8(i + 6) === 0x79 && u8(i + 7) === 0x70) {
        ok = true;
        break;
      }
    }
    if (!ok) return "Conteúdo não corresponde a MP4 (ftyp)";
    return null;
  }
  if (ct === "video/webm") {
    if (u8(0) !== 0x1a || u8(1) !== 0x45 || u8(2) !== 0xdf || u8(3) !== 0xa3) return "Conteúdo não corresponde a WebM";
    return null;
  }
  if (ct === "application/pdf") {
    if (buf.length < 5) return null;
    if (String.fromCharCode(u8(0), u8(1), u8(2), u8(3), u8(4)) !== "%PDF-") {
      return "Conteúdo não corresponde a PDF";
    }
    return null;
  }
  return null;
}
