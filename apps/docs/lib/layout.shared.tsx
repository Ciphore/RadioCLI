import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

// Mirrors the in-app overview logo spectrum (src/ui/components/Logo.tsx) so the
// nav glyph matches the rainbow shown on the app's Overview tab exactly.
const spectrumColors = [
  '#ff4b5c',
  '#ff9f43',
  '#ffd166',
  '#a3e635',
  '#22c55e',
  '#2dd4bf',
  '#38bdf8',
  '#818cf8',
  '#c084fc',
];

export function Brand() {
  return (
    <span className="rc-brand">
      <span className="rc-brand-wordmark">{appName.toUpperCase()}</span>
      <span className="rc-brand-spectrum" aria-hidden>
        {spectrumColors.map((color) => (
          <span key={color} style={{ backgroundColor: color }} />
        ))}
      </span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Brand />,
    },
    links: [
      { text: 'Receivers', url: '/receivers', active: 'url' },
      {
        text: 'Docs',
        url: '/docs',
        active: 'nested-url',
      },
      {
        text: 'Changelog',
        url: '/docs/changelog',
        active: 'url',
      },
      {
        type: 'icon',
        text: 'npm',
        label: 'RadioCLI on npm',
        icon: <svg viewBox="0 0 18 7" aria-hidden="true" fill="currentColor"><path d="M0 0v6h5v1h4V6h9V0zm5 5H4V2H3v3H1V1h4zm4 0H8v1H6V1h4v4zm8 0h-1V2h-1v3h-1V2h-1v3h-2V1h6zM7 2h1v2H7z" /></svg>,
        url: 'https://www.npmjs.com/package/@ciphore/radiocli',
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
