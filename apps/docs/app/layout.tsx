import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { getSiteUrl, siteDescription } from '@/lib/seo';
import './global.css';

export const metadata: Metadata = {
  title: {
    default: 'RadioCLI',
    template: '%s | RadioCLI',
  },
  description: siteDescription,
  metadataBase: getSiteUrl(),
  applicationName: 'RadioCLI',
  category: 'technology',
  creator: 'Ciphore',
  publisher: 'Ciphore',
  manifest: '/manifest.webmanifest',
  alternates: {
    types: {
      'text/plain': '/llms.txt',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION
      ? {
          other: {
            'msvalidate.01': process.env.BING_SITE_VERIFICATION,
          },
        }
      : {}),
  },
  openGraph: {
    title: 'RadioCLI',
    description:
      'Terminal-first public radio discovery, playback, favorites, stats, and provider resilience.',
    images: ['/demo/radiocli-fullscreen.png'],
    locale: 'en_US',
    siteName: 'RadioCLI',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RadioCLI',
    description:
      'Terminal-first public radio discovery, playback, favorites, stats, and provider resilience.',
    images: ['/demo/radiocli-fullscreen.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: 'system', enableSystem: true }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
