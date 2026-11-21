/** Google Images result pages are HTML, not images. Allow only safe relative paths or HTTPS URLs. */
export function productImageUrl(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return '/assets/product-placeholder.svg';
  if (/[\s\\]/.test(trimmed) || Array.from(trimmed).some((ch) => ch.charCodeAt(0) <= 0x1f)) {
    return '/assets/product-placeholder.svg';
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return '/assets/product-placeholder.svg';
    }
    if (/^(?:www\.)?google\.[a-z.]+$/i.test(url.hostname) && url.pathname === '/imgres') {
      const image = url.searchParams.get('imgurl');
      if (image) {
        const inner = new URL(image);
        if (inner.protocol === 'https:' && !inner.username && !inner.password) return image;
      }
      return '/assets/product-placeholder.svg';
    }
    return trimmed;
  } catch {
    return '/assets/product-placeholder.svg';
  }
}

export function productImageFallback(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = '/assets/product-placeholder.svg';
}
