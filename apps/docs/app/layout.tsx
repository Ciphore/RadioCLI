import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';

export const metadata: Metadata = {
  title: {
    default: 'RadioCLI',
    template: '%s | RadioCLI',
  },
  description:
    'A terminal-first world radio receiver with resilient public-radio providers, local-first listening history, and docs for the full CLI workflow.',
  metadataBase: new URL('https://github.com/Ciphore/RadioCLI'),
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
