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

function Brand() {
  return (
    <span className="rc-brand">
      {appName.toUpperCase()}
      <span className="rc-brand-spectrum" aria-hidden>
        {spectrumColors.map((color) => (
          <span key={color} style={{ color }}>
            █
          </span>
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
        text: 'GitHub',
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
