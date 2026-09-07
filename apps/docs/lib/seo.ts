import { source } from './source';
import { gitConfig } from './shared';

export const siteName = 'RadioCLI';
export const siteDescription =
  'A terminal-first world radio receiver with resilient public-radio providers, local-first listening history, and docs for the full CLI workflow.';
export const repositoryUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
export const licenseUrl = `${repositoryUrl}/blob/${gitConfig.branch}/LICENSE`;

function normalizeSiteUrl(value: string) {
  const trimmedValue = value.trim();
  const siteUrl =
    trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')
      ? trimmedValue
      : `https://${trimmedValue}`;

  return new URL(siteUrl);
}

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) return normalizeSiteUrl(configuredUrl);

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) return normalizeSiteUrl(productionUrl);

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return normalizeSiteUrl(vercelUrl);

  const cloudflarePagesUrl = process.env.CF_PAGES_URL?.trim();
  if (cloudflarePagesUrl) return normalizeSiteUrl(cloudflarePagesUrl);

  return new URL('http://localhost:3000');
}

export function absoluteUrl(pathname: string) {
  return new URL(pathname, getSiteUrl()).toString();
}

export function getDocumentationPages() {
  return source.getPages().map((page) => ({
    description: page.data.description,
    title: page.data.title,
    url: absoluteUrl(page.url),
  }));
}

const pageSeoTitles: Record<string, string> = {
  '/docs': 'Terminal Internet Radio Player Documentation',
  '/docs/getting-started/install': 'Install RadioCLI on macOS, Linux, and Windows',
  '/docs/getting-started/cli': 'RadioCLI Commands and CLI Usage',
  '/docs/getting-started/tui-controls': 'RadioCLI Terminal UI Controls',
  '/docs/architecture': 'RadioCLI Architecture',
  '/docs/reliability': 'Internet Radio Playback Reliability',
  '/docs/privacy-security': 'RadioCLI Privacy and Security',
  '/docs/contributing': 'Contribute to RadioCLI',
};

export function getPageSeoTitle(url: string, fallback: string) {
  return pageSeoTitles[url] ?? fallback;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function getHomeJsonLd() {
  const siteUrl = absoluteUrl('/');
  const imageUrl = absoluteUrl('/demo/radiocli-fullscreen.png');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}#website`,
        name: siteName,
        url: siteUrl,
        description: siteDescription,
        inLanguage: 'en',
      },
      {
        '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
        '@id': `${siteUrl}#software`,
        name: siteName,
        description: siteDescription,
        url: siteUrl,
        image: imageUrl,
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Internet radio player',
        operatingSystem: ['macOS', 'Linux', 'Windows'],
        runtimePlatform: 'Node.js 22 or newer',
        programmingLanguage: ['TypeScript', 'JavaScript'],
        codeRepository: repositoryUrl,
        downloadUrl: 'https://www.npmjs.com/package/@ciphore/radiocli',
        installUrl: absoluteUrl('/docs/getting-started/install'),
        softwareVersion: '0.2.3',
        license: licenseUrl,
        isAccessibleForFree: true,
        author: {
          '@type': 'Person',
          name: gitConfig.user,
          url: `https://github.com/${gitConfig.user}`,
        },
      },
    ],
  };
}

export function getDocsJsonLd(page: (typeof source)['$inferPage']) {
  const pageUrl = absoluteUrl(page.url);
  const siteUrl = absoluteUrl('/');
  const breadcrumbItems = [
    { name: 'RadioCLI', url: siteUrl },
    { name: 'Docs', url: absoluteUrl('/docs') },
  ];

  if (page.url !== '/docs') {
    breadcrumbItems.push({ name: page.data.title, url: pageUrl });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${pageUrl}#article`,
        headline: page.data.title,
        description: page.data.description,
        url: pageUrl,
        mainEntityOfPage: pageUrl,
        inLanguage: 'en',
        isPartOf: { '@id': `${siteUrl}#website` },
        author: {
          '@type': 'Person',
          name: gitConfig.user,
          url: `https://github.com/${gitConfig.user}`,
        },
        license: licenseUrl,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      },
    ],
  };
}
