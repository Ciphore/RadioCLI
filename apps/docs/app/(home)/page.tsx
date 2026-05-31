import type { Metadata } from 'next';
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
    images: ['/demo/radiocli-fullscreen.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RadioCLI',
    description: homeDescription,
    images: ['/demo/radiocli-fullscreen.png'],
  },
};

const specs = [
  {
    label: 'Providers',
    body: 'Radio Browser primary, Radio Garden optional, playlist imports treated as first-class stations.',
  },
  {
    label: 'Playback',
    body: 'mpv first for IPC controls, ffplay fallback for playback-only recovery.',
  },
  {
    label: 'Controls',
    body: 'Adaptive footer, command palette, learned media keys, previous/next source-list queues.',
  },
  {
    label: 'Privacy',
    body: 'No account, no proxy, no secrets. Nearby discovery is opt-in and approximate.',
  },
];

const features = [
  {
    title: 'World radio, no browser',
    body: 'Explore countries, search stations, tune nearby streams, and keep the whole loop inside a fast Ink terminal UI.',
  },
  {
    title: 'Built for flaky streams',
    body: 'Mirror fallback, stale-cache fallback, tune timeouts, backend readiness checks, and skip-broken-stream behavior are first-class paths.',
  },
  {
    title: 'A receiver, not a wrapper',
    body: 'Now Playing has 50 signal-gated receiver styles, stream diagnostics, ICY metadata cleanup, mpv-backed controls, favorites, and a sleep timer.',
  },
  {
    title: 'Local-first library',
    body: 'Recents, favorites, imports, provider cache, settings, learned media keys, and listening sessions stay on your machine.',
  },
  {
    title: 'CLI and TUI parity',
    body: 'Use the full-screen receiver or command mode for search, country lists, playlist import/export, checks, and direct stream adds.',
  },
  {
    title: 'Docs beside the product',
    body: 'Install, controls, architecture, reliability, privacy, release notes, and release scope all live in this one site.',
  },
];

export default function HomePage() {
  return (
    <main className="rc-home">
      <div className="rc-shell">
        <section className="rc-hero">
          <div className="rc-hero-copy">
            <p className="rc-eyebrow">terminal receiver for public radio</p>
            <h1 className="rc-title">
              RadioCLI<span className="rc-cursor">_</span>
            </h1>
            <p className="rc-lede">{homeDescription}</p>
            <div className="rc-actions">
              <Link className="rc-btn" href="/docs/getting-started/install">
                Install RadioCLI
              </Link>
              <Link className="rc-btn" data-variant="ghost" href="/docs">
                Read the docs
              </Link>
              <Link
                className="rc-btn"
                data-variant="ghost"
                href="https://github.com/Ciphore/RadioCLI"
              >
                GitHub
              </Link>
            </div>
            <p className="rc-install">
              <span className="rc-prompt">$</span>
              <code>brew install ciphore/tap/radiocli &amp;&amp; radiocli</code>
            </p>
          </div>

          <figure className="rc-terminal-preview" aria-label="RadioCLI full-screen Now Playing screenshot">
            <img
              className="rc-terminal-screenshot"
              src="/demo/radiocli-fullscreen.png"
              alt="RadioCLI full-screen Now Playing receiver"
              width="1280"
              height="760"
            />
          </figure>
        </section>

        <section className="rc-section" aria-label="RadioCLI signal summary">
          <div className="rc-strip">
            {specs.map((spec) => (
              <div key={spec.label}>
                <strong>{spec.label}</strong>
                <span>{spec.body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rc-section">
          <div className="rc-heading">
            <p className="rc-kicker">
              <b>~/radiocli</b> · one site for the product and the manual
            </p>
            <h2>Tune the whole world from a prompt.</h2>
            <p>
              The public surface is organized around what a listener or contributor
              actually needs: quick setup, command usage, TUI controls, architecture,
              reliability, privacy, release notes, and release scope.
            </p>
          </div>
          <div className="rc-grid">
            {features.map((feature) => (
              <article key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rc-section">
          <div className="rc-cta">
            <div className="rc-cta-copy">
              <h2>Ready to start tuning?</h2>
              <p>Install mpv, grab the CLI, and run the doctor check.</p>
            </div>
            <Link className="rc-btn" href="/docs/getting-started/install">
              Get started →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
