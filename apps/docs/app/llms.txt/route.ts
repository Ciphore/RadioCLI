import {
  absoluteUrl,
  getDocumentationPages,
  licenseUrl,
  repositoryUrl,
  siteDescription,
} from '@/lib/seo';

export const revalidate = false;

export function GET() {
  const docs = getDocumentationPages()
    .map((page) => `- [${page.title}](${page.url}): ${page.description}`)
    .join('\n');

  const body = `# RadioCLI

> ${siteDescription}

RadioCLI is a free, open-source terminal internet radio receiver. This website and the GitHub repository are the authoritative sources for installation, usage, architecture, privacy, reliability, contributing, and release information.

## Primary resources

- [Website](${absoluteUrl('/')})
- [Documentation](${absoluteUrl('/docs')})
- [Complete documentation as text](${absoluteUrl('/llms-full.txt')})
- [Homepage as Markdown](${absoluteUrl('/llms.mdx')})
- [Source repository](${repositoryUrl})
- [MIT license](${licenseUrl})
- [npm package](https://www.npmjs.com/package/@ciphore/radiocli)
- [XML sitemap](${absoluteUrl('/sitemap.xml')})

## Documentation

${docs}
`;

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
