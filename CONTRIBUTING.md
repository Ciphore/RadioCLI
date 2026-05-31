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

Install `mpv` for playback controls, metadata polling, and the best playback
experience:

```bash
brew install mpv
```

On Linux, use your package manager's `mpv` package. On Windows, use:

```powershell
winget install --id shinchiro.mpv -e
```

## Verification

Run these before opening a PR:

```bash
npm run check
npm run lint
npm run test
npm run build
```

Run `npm run smoke:playback` when changing playback code. It opens a public
stream briefly, so do not run it in environments where audio/network access is
not acceptable.

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
- Add tests for parsing, storage, layout, or provider transformations when the
  behavior can be checked without live audio.

## Issue Triage

Playback issues should include station name, country, backend, and
`radiocli check` or `radiocli doctor` output when possible. If the backend is
`ffplay`, pause, mute, volume, and play/pause media-key behavior are expected to
be limited until `mpv` is installed.
