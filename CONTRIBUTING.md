# Contributing

Thanks for considering a contribution. Radio Atlas is intentionally small, but
the bar is high: changes should improve the product, preserve terminal
ergonomics, and respect the unreliability of public radio streams.

## Setup

```bash
npm ci
npm run build
npm run test
```

Install `mpv` for the best playback experience:

```bash
brew install mpv
```

On Linux, use your package manager's `mpv` package.

## Verification

Run these before opening a PR:

```bash
npm run check
npm run test
npm run build
npm run smoke:data
```

Run `npm run smoke:playback` when changing playback code. It opens a public
stream briefly, so do not run it in environments where audio/network access is
not acceptable.

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
`radio-atlas check` output when possible.
