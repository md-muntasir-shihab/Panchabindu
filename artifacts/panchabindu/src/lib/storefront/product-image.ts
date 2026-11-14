/** Google Images result pages are HTML, not images. Use their direct HTTPS image. */
export function productImageUrl(value?: string | null): string {
  if (!value) return '/assets/product-placeholder.svg';
  try {
    const url = new URL(value, 'https://store.invalid');
    if (/^(?:www\.)?google\.[a-z.]+$/i.test(url.hostname) && url.pathname === '/imgres') {
      const image = url.searchParams.get('imgurl');
      if (image && new URL(image).protocol === 'https:') return image;
      return '/assets/product-placeholder.svg';
    }
  } catch { return '/assets/product-placeholder.svg'; }
  return value;
}

export function productImageFallback(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = '/assets/product-placeholder.svg';
}
