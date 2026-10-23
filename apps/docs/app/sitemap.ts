import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { source } from '@/lib/source';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    { url: absoluteUrl('/receivers'), changeFrequency: 'monthly', priority: 0.8 },
    ...source.getPages().map((page) => ({
      url: absoluteUrl(page.url),
      changeFrequency: page.url === '/docs/changelog' ? ('weekly' as const) : ('monthly' as const),
      priority: page.url === '/docs' ? 0.9 : 0.7,
    })),
  ];
}
