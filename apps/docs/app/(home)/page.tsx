import type { Metadata } from 'next';
import Link from 'next/link';
import { vhsFont } from '@/lib/vhs-font';
import { getHomeJsonLd, serializeJsonLd, siteDescription } from '@/lib/seo';
import { ReceiverGallery } from '@/components/receiver-gallery';
import { ProductDemo } from '@/components/product-demo';
import { InstallCommand } from '@/components/install-command';
import { Brand } from '@/lib/layout.shared';
import { TerminalLayoutDemo } from '@/components/terminal-layout-demo';
import './vhs-headings.css';

export const metadata: Metadata = {
  title: { absolute: 'RadioCLI — Internet radio for your terminal' },
  description: siteDescription,
  alternates: { canonical: '/' },
  openGraph: { title: 'RadioCLI — Internet radio for your terminal', description: siteDescription, images: ['/demo/radiocli-fullscreen.png'], type: 'website' },
  twitter: { card: 'summary_large_image', title: 'RadioCLI — Internet radio for your terminal', description: siteDescription, images: ['/demo/radiocli-fullscreen.png'] },
};

const features = [
  { title: 'Explore the world map', body: 'Move around an interactive world map to find broadcasts near any location. Browse countries and tune stations sorted by distance from the pin point.', demo: 'explore-map', label: 'Exploring the RadioCLI world map', href: '/docs/getting-started/tui-controls', link: 'Explore controls' },
  { title: 'Search stations', body: 'Search by station name or genre, or filter by country, language, codec, and bitrate. Find new favorites or listen to your existing library.', demo: 'search', label: 'Searching for radio stations', href: '/docs/getting-started/tui-controls', link: 'Search controls' },
  { title: 'Your station library', body: 'Keep favorites, recent stations, and imported streams in one place. Review track history, return to a recent station, and back up your library for easy setups.', demo: 'library', label: 'RadioCLI favorites and recent stations', href: '/docs/getting-started/cli', link: 'Library commands' },
  { title: 'Nearby stations', body: 'Find stations around your approximate location and browse them by distance.', demo: 'nearby', label: 'Browsing stations near your location', href: '/docs/privacy-security', link: 'Location & privacy' },
  { title: 'Listening stats', body: 'See a 52-week activity graph, listening time, session counts, active days, streaks, and your most-played station.', demo: 'stats-colors', label: 'RadioCLI listening activity and stats', href: '/docs/getting-started/cli', link: 'Stats commands' },
  { title: 'Alarms & sleep timer', body: 'Schedule one-time or recurring radio alarms with fade-in, snooze, fallback stations, and auto-stop. Set a sleep timer to stop playback when you sleep.', demo: 'alarm-editor', label: 'RadioCLI alarm settings', href: '/docs/alarms', link: 'Alarm setup · beta' },
  { title: 'MCP agent controls', body: 'Give your agent access to RadioCLI’s controls through MCP. Discover stations, manage playback, build your library, and set alarms—all from a conversation.', demo: 'codex-birdsong', label: 'Codex CLI finding and playing Birdsong Radio through RadioCLI MCP tools', href: '/docs/getting-started/cli', link: 'MCP setup' },
];

const details = [
  { title: 'Playback controls', body: 'Pause, change volume, mute, and view the current track. Use media keys outside the terminal or skip through the station list you tuned from.', href: '/docs/getting-started/tui-controls', link: 'Controls' },
  { title: 'Shell commands', body: 'Start background playback, save named presets, and check the current track. Shell completion and JSON output support scripts and local tools.', href: '/docs/getting-started/cli', link: 'CLI reference' },
  { title: 'Custom stations & playlists', body: 'Add direct stream URLs or import M3U, PLS, and XSPF playlists. Keep imported stations in your library and export the collection as an M3U file.', href: '/docs/getting-started/cli', link: 'Station commands' },
  { title: 'AirPlay · experimental', body: 'Discover network receivers and switch audio output from the terminal. Enter a passcode when needed, with support depending on your setup.', href: '/docs/platforms', link: 'Supported setups' },
  { title: 'Stream recovery', body: 'Try directory mirrors and skip broken streams when playback fails. Browse cached station lists during directory outages or use low-bandwidth mode.', href: '/docs/reliability', link: 'How recovery works' },
  { title: 'Local data & backups', body: 'Keep favorites, settings, track history, and listening stats on your machine. Back up and restore your data as JSON, with no account required.', href: '/docs/privacy-security', link: 'Privacy & storage' },
];

function VisualFeature({ feature, wide = false }: { feature: typeof features[number]; wide?: boolean }) {
  return <section className={wide ? "rc-visual-feature rc-feature-wide" : "rc-visual-feature"}>
          <div className="rc-feature-copy">
            <h2>{feature.title}</h2><p>{feature.body}</p>
            <Link className="rc-text-link" href={feature.href}>{feature.link} →</Link>
          </div>
          <figure className="rc-feature-still">
            <img src={`/demo/radiocli-${feature.demo === 'stats-colors' ? 'stats-green' : feature.demo}.png`}
              width={1280} height={760}
              alt={feature.label} loading="lazy" />
          </figure>
        </section>;
}

export default function HomePage() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getHomeJsonLd()) }} />
    <div className={`rc-home rc-vhs-landing ${vhsFont.variable}`}><div className="rc-shell">
      <section className="rc-hero">
        <div className="rc-hero-copy">
          <h1>The world’s radio.<br /><span>At your command.</span></h1>
          <p className="rc-lede">Open-source internet radio player with a full-screen terminal interface and a scriptable CLI. Discover and stream stations from around the world without leaving your terminal. No account. No cloud library.</p>
          <div className="rc-actions">
            <Link className="rc-btn" href="/docs/getting-started/install"><span className="rc-vhs-button-label">Install RadioCLI</span></Link>
            <Link className="rc-text-link" href="/docs">Read the docs →</Link>
          </div>
          <p className="rc-availability">Free & open source · macOS, Linux & Windows</p>
        </div>
        <ProductDemo src="/demo/radiocli-now-playing.webm" poster="/demo/radiocli-fullscreen.png" label="Now playing in RadioCLI" />
      </section>

      <section className="rc-install-section" aria-labelledby="install-heading">
        <div className="rc-install-heading"><h2 id="install-heading">Quick start</h2>
          <Link className="rc-text-link" href="/docs/getting-started/install">Installation guide →</Link></div>
        <div className="rc-install-options">
          <InstallCommand label="npm · Node.js 22+" command={'npm install -g @ciphore/radiocli\nradiocli setup\nradiocli'} />
          <InstallCommand label="Homebrew · macOS" command={'brew install ciphore/tap/radiocli\nradiocli'} />
        </div>
      </section>

      <div className="rc-wide-features">
        {features.filter((_, index) => index === 0 || index === 1 || index === 4).map(feature => <VisualFeature key={feature.demo} feature={feature} wide />)}
      </div>

      <ReceiverGallery preview />
      <Link className="rc-text-link rc-gallery-link" href="/receivers">Try all 64 receiver styles →</Link>

      <div className="rc-visual-features">
        {features.filter((_, index) => index > 1 && index !== 4).map(feature => <VisualFeature key={feature.demo} feature={feature} />)}
      </div>

        <section className="rc-layout-section">
          <div className="rc-feature-copy">
            <h2>Full, compact & micro layouts</h2>
            <p>RadioCLI adapts to your terminal size, from full screen to a small pane. Built for accessible listening, with screen-reader support, reduced motion, and keyboard, mouse, and trackpad controls.</p>
            <Link className="rc-text-link" href="/docs/getting-started/tui-controls">Terminal controls →</Link>
          </div>
          <TerminalLayoutDemo />
        </section>

      <section className="rc-more" aria-labelledby="more-heading">
        <h2 id="more-heading">More features</h2>
        <div className="rc-feature-list">{details.map(feature => <article key={feature.title}>
          <h3>{feature.title}</h3><p>{feature.body}</p>
          <Link className="rc-text-link" href={feature.href}>{feature.link} →</Link>
        </article>)}</div>
      </section>

      <section className="rc-cta" aria-labelledby="cta-heading">
        <div><h2 id="cta-heading">Start listening.</h2><p>Free and open source. Available for macOS, Linux, and Windows.</p></div>
        <Link className="rc-btn" href="/docs/getting-started/install"><span className="rc-vhs-button-label">Install RadioCLI</span></Link>
      </section>
      <footer className="rc-footer"><Link className="rc-footer-brand" href="/"><Brand /></Link>
        <p>Free and open source · MIT license</p><div><Link href="/docs">Manual</Link><Link href="https://github.com/Ciphore/RadioCLI">GitHub ↗</Link></div></footer>
    </div></div>
  </>;
}
