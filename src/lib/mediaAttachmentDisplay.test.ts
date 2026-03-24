import { describe, expect, it } from 'vitest';
import { getAttachmentImageSrc, getAttachmentOpenHref } from './mediaAttachmentDisplay';

describe('getAttachmentImageSrc', () => {
  it('prefers thumb_url', () => {
    expect(
      getAttachmentImageSrc(
        { thumb_url: '/t', full_url: '/f', url: '/u', mime_type: 'image/jpeg' },
        'image',
      ),
    ).toBe('/t');
  });

  it('uses signed_url for image mime when no thumb', () => {
    expect(
      getAttachmentImageSrc({ signed_url: 'https://s', url: 'https://u', mime_type: 'image/png' }, 'text'),
    ).toBe('https://s');
  });

  it('uses full_url when message is image type without mime', () => {
    expect(getAttachmentImageSrc({ full_url: 'https://f', url: 'https://u' }, 'image')).toBe('https://f');
  });

  it('uses url for image extension when content_type image', () => {
    expect(
      getAttachmentImageSrc({ url: 'https://cdn/x.jpg', file_name: 'x.jpg' }, 'image'),
    ).toBe('https://cdn/x.jpg');
  });

  it('returns null for non-image attachment', () => {
    expect(
      getAttachmentImageSrc({ url: 'https://x', mime_type: 'application/pdf', file_name: 'a.pdf' }, 'file'),
    ).toBeNull();
  });
});

describe('getAttachmentOpenHref', () => {
  it('prefers full_url then signed_url', () => {
    expect(getAttachmentOpenHref({ full_url: 'f', signed_url: 's', url: 'u' })).toBe('f');
    expect(getAttachmentOpenHref({ signed_url: 's', url: 'u' })).toBe('s');
  });
});
