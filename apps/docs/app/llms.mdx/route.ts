import { absoluteUrl, repositoryUrl, siteDescription } from '@/lib/seo';

export const revalidate = false;

export function GET() {
  const body = `# RadioCLI

${siteDescription}

RadioCLI is a free, MIT-licensed terminal internet radio receiver for macOS, Linux, and Windows. It discovers live public stations, plays streams through local playback tools, and keeps favorites, recents, settings, and listening history on the user's machine.

## Install

With npm:

\`\`\`bash
npm install -g @ciphore/radiocli
radiocli setup
\`\`\`

On macOS with Homebrew:

\`\`\`bash
brew install ciphore/tap/radiocli
\`\`\`

## Authoritative resources

- [Documentation](${absoluteUrl('/docs')})
- [LLM documentation index](${absoluteUrl('/llms.txt')})
- [Complete documentation text](${absoluteUrl('/llms-full.txt')})
- [Source code](${repositoryUrl})
- [Install guide](${absoluteUrl('/docs/getting-started/install')})
- [CLI command reference](${absoluteUrl('/docs/getting-started/cli')})
`;

  return new Response(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
