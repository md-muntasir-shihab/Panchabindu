// Applies serialized Next-style Metadata objects to document.head.
type ImageLike = string | { url?: string };
export interface PageMetadata {
  title?: string | { absolute?: string; default?: string };
  description?: string;
  robots?: { index?: boolean; follow?: boolean } | string;
  alternates?: { canonical?: string };
  icons?: { icon?: string; apple?: string };
  openGraph?: { title?: string; description?: string; type?: string; images?: ImageLike[] | ImageLike };
  twitter?: { card?: string; title?: string; description?: string; images?: ImageLike[] | ImageLike };
}

const MARK = 'data-page-meta';

function imgs(v: ImageLike[] | ImageLike | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((i) => (typeof i === 'string' ? i : i.url ?? '')).filter(Boolean);
}

function add(tag: 'meta' | 'link', attrs: Record<string, string>) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute(MARK, '');
  document.head.appendChild(el);
}

export function applyMetadata(meta: PageMetadata | undefined) {
  document.head.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
  if (!meta) return;
  const title = typeof meta.title === 'string' ? meta.title : meta.title?.absolute ?? meta.title?.default;
  if (title) document.title = title;
  if (meta.description) add('meta', { name: 'description', content: meta.description });
  if (meta.robots) {
    const content = typeof meta.robots === 'string' ? meta.robots
      : `${meta.robots.index === false ? 'noindex' : 'index'}, ${meta.robots.follow === false ? 'nofollow' : 'follow'}`;
    add('meta', { name: 'robots', content });
  }
  if (meta.alternates?.canonical) add('link', { rel: 'canonical', href: meta.alternates.canonical });
  if (meta.icons?.icon) add('link', { rel: 'icon', href: meta.icons.icon });
  if (meta.icons?.apple) add('link', { rel: 'apple-touch-icon', href: meta.icons.apple });
  const og = meta.openGraph;
  if (og) {
    if (og.title) add('meta', { property: 'og:title', content: og.title });
    if (og.description) add('meta', { property: 'og:description', content: og.description });
    if (og.type) add('meta', { property: 'og:type', content: og.type });
    imgs(og.images).forEach((u) => add('meta', { property: 'og:image', content: u }));
  }
  const tw = meta.twitter;
  if (tw) {
    if (tw.card) add('meta', { name: 'twitter:card', content: tw.card });
    if (tw.title) add('meta', { name: 'twitter:title', content: tw.title });
    if (tw.description) add('meta', { name: 'twitter:description', content: tw.description });
    imgs(tw.images).forEach((u) => add('meta', { name: 'twitter:image', content: u }));
  }
}
