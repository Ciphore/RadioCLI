import { getLLMText, source } from '@/lib/source';
import { absoluteUrl, repositoryUrl, siteDescription } from '@/lib/seo';

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);
  const introduction = `# RadioCLI — complete documentation

> ${siteDescription}

- Website: ${absoluteUrl('/')}
- Repository: ${repositoryUrl}
- Documentation index: ${absoluteUrl('/llms.txt')}`;

  return new Response([introduction, ...scanned].join('\n\n---\n\n'), {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
