# Contributing

Thanks for considering a contribution. RadioCLI is intentionally small, but
the bar is high: changes should improve the product, preserve terminal
ergonomics, and respect the unreliability of public radio streams.

## Setup

```bash
npm ci
npm run build
npm run test
```

Install `mpv` for playback controls and metadata polling. On a macOS
configuration supported by Homebrew:

```bash
brew install mpv
```

On Linux, use your package manager's `mpv` package. On Windows x64, use:

```powershell
winget install --id shinchiro.mpv -e
```

Use the [platform installation routes](apps/docs/content/docs/platforms.mdx#installation-and-playback-prerequisites)
for Windows arm64 and other package managers.

## Verification

Run these before opening a PR:

```bash
npm run check
npm run lint
npm run test
npm run build
npm run pack:check
npm run fresh:check -- --require-mpv
npm run check:package
npm run smoke:mcp
npm run docs:check
npm run docs:build
```

Install documentation dependencies with `npm --prefix apps/docs ci` first.
Run `npm run smoke:playback` when changing playback code. Its default fixture is
a local WAV file; mpv uses null audio in deterministic package
checks. These checks exercise the player process and controls, and do not prove
speaker output. `npm run smoke:data` intentionally contacts public providers.

Live provider checks are useful before releases, but ordinary pull requests
should stay deterministic. Run `npm run verify:release` for a full maintainer
pre-release pass that includes live data, playback, packaging, and fresh-install
checks.

## Development Principles

- Keep public provider adapters isolated.
- Treat station streams as unreliable.
- Never make location lookup implicit.
- Prefer clear terminal text over decorative filler.
- Keep command-line and TUI behavior aligned.
- Put OS decisions in `src/platform`; keep capability availability separate from
  runtime eligibility and recorded platform verification.
- Add tests for parsing, storage, layout, or provider transformations when the
  behavior can be checked without live audio.

## Platform verification

Run the Node 22/24 matrix and preserve its strict gates. Expanded native jobs
test x64 and arm64 installation and actual mpv control; weekly or opt-in BSD
checks execute the packed JavaScript in guest kernels. Changes to script harnesses
also require `node --test scripts/packed-smoke.test-node.mjs scripts/install-smoke-mpv.test-node.mjs`.

Record OS release, CPU, endianness, libc, Node/npm versions, artifact hash, and
whether execution was native, virtualized, emulated, or mocked. An installation
test, native command mock, or foreign binary inspection alone cannot promote a
platform to supported. Follow the [support tiers](apps/docs/content/docs/platforms.mdx).

The deterministic visual fixtures cover full, compact and micro layouts, all
major screens and receiver styles. Preserve Unicode captures. Explain intentional
portable-rendering changes with before/after captures; do not update snapshots
just to hide failures. See [the captures](docs/cross-platform/visual-before-after.txt).

## Issue Triage

Playback issues should include station name, country, backend, and
`radiocli check` or `radiocli doctor` output when possible. If the backend is
`ffplay`, pause, mute, volume, and play/pause media-key behavior are expected to
be limited until `mpv` is installed.
