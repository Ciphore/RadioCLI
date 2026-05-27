import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';

function normalizeSiteUrl(value: string) {
  const trimmedValue = value.trim();
  const siteUrl =
    trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')
      ? trimmedValue
      : `https://${trimmedValue}`;

  return new URL(siteUrl);
}

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) return normalizeSiteUrl(configuredUrl);

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return normalizeSiteUrl(vercelUrl);

  const cloudflarePagesUrl = process.env.CF_PAGES_URL?.trim();
  if (cloudflarePagesUrl) return normalizeSiteUrl(cloudflarePagesUrl);

  return new URL('http://localhost:3000');
}

export const metadata: Metadata = {
  title: {
    default: 'RadioCLI',
    template: '%s | RadioCLI',
  },
  description:
    'A terminal-first world radio receiver with resilient public-radio providers, local-first listening history, and docs for the full CLI workflow.',
  metadataBase: getSiteUrl(),
  openGraph: {
    title: 'RadioCLI',
    description:
      'Terminal-first public radio discovery, playback, favorites, stats, and provider resilience.',
    images: ['/radiocli-receiver-preview.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: 'dark', enableSystem: false }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
