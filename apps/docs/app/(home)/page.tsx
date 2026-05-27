import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

const homeDescription =
  'Explore live public stations around the world, tune real streams through local playback backends, and keep your radio library close to the command line.';

export const metadata: Metadata = {
  title: {
    absolute: 'RadioCLI',
  },
  description: homeDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'RadioCLI',
    description: homeDescription,
    images: ['/radiocli-receiver-preview.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RadioCLI',
    description: homeDescription,
    images: ['/radiocli-receiver-preview.png'],
  },
};

const features = [
  {
    title: 'World radio without the browser tax',
    body: 'Explore countries, search stations, tune nearby streams, and keep the whole loop inside a fast Ink terminal UI.',
  },
  {
    title: 'Built for unreliable streams',
    body: 'Mirror fallback, stale-cache fallback, tune timeouts, backend readiness checks, and skip-broken-stream behavior are first-class paths.',
  },
  {
    title: 'A receiver, not a wrapper',
    body: 'Now Playing includes spectrum styles, stream diagnostics, ICY metadata cleanup, transport controls, favorites, volume, and sleep timer state.',
  },
  {
    title: 'Local-first library state',
    body: 'Recents, favorites, imports, provider cache, settings, learned media keys, and listening sessions stay on your machine.',
  },
  {
    title: 'CLI and TUI parity',
    body: 'Use the full-screen receiver or command mode for search, country lists, playlist import/export, checks, and direct stream adds.',
  },
  {
    title: 'Documentation beside the product',
    body: 'Install, controls, architecture, reliability, privacy, release notes, and roadmap now live in one Fumadocs site.',
  },
];

export default function HomePage() {
  return (
    <main className="radiocli-home">
      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">terminal receiver for public radio</p>
          <h1 className="hero-title">RadioCLI</h1>
          <p className="hero-lede">{homeDescription}</p>
          <div className="hero-actions">
            <Link className="radio-button" href="/docs/getting-started/install">
              Install RadioCLI
            </Link>
            <Link className="radio-button" href="/docs">
              Read the docs
            </Link>
            <Link
              className="radio-button"
              data-variant="ghost"
              href="https://github.com/Ciphore/RadioCLI"
            >
              GitHub
            </Link>
          </div>
        </div>

        <div className="receiver-frame" aria-label="RadioCLI receiver preview">
          <Image
            src="/radiocli-receiver-preview.png"
            alt="RadioCLI terminal receiver preview showing a Now Playing spectrum display"
            width={1400}
            height={900}
            priority
          />
        </div>
      </section>

      <section className="signal-row" aria-label="RadioCLI signal summary">
        <div>
          <strong>Providers</strong>
          <span>Radio Browser primary, Radio Garden optional, playlist imports treated as first-class stations.</span>
        </div>
        <div>
          <strong>Playback</strong>
          <span>mpv first, ffplay fallback, IPC controls for pause, mute, volume, readiness, and metadata.</span>
        </div>
        <div>
          <strong>Controls</strong>
          <span>Adaptive footer, command palette, learned media keys, previous/next source-list queues.</span>
        </div>
        <div>
          <strong>Privacy</strong>
          <span>No account, no proxy, no secrets. Nearby discovery is opt-in and approximate.</span>
        </div>
      </section>

      <section className="site-section">
        <div className="section-heading">
          <h2>One site for the product and the manual.</h2>
          <p>
            The public surface is now organized around what a listener or contributor needs:
            quick setup, command usage, TUI controls, architecture, reliability, privacy,
            release notes, and the roadmap.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="install-strip">
          <code>brew install mpv ffmpeg && npm install -g radiocli</code>
          <Link className="radio-button" href="/docs/getting-started/install">
            Start tuning
          </Link>
        </div>
      </section>
    </main>
  );
}
