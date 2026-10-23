import type { Metadata } from 'next';
import Link from 'next/link';
import { vhsFont } from '@/lib/vhs-font';
import './receiver-names.css';
import { ReceiverGallery } from '@/components/receiver-gallery';

export const metadata: Metadata = {
  title: '63 Receiver Styles',
  description: 'Explore all 63 RadioCLI receiver styles, with their original palettes and supported theme colors. Animated directly from the terminal renderer.',
  alternates: { canonical: '/receivers' },
  openGraph: { title: 'RadioCLI Receiver Styles', url: '/receivers', description: '63 animated receiver styles, original palettes, and supported theme colors.' },
};

export default function ReceiversPage() {
  return <div className={`rc-home ${vhsFont.variable}`}><div className="rc-shell rc-gallery-page">
    <Link className="rc-text-link" href="/">← RadioCLI</Link>
    <ReceiverGallery />
    <div className="rc-gallery-note">
      <Link className="rc-text-link" href="/docs/getting-started/install">Install RadioCLI →</Link></div>
  </div></div>;
}
