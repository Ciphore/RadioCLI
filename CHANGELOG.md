# Changelog

All notable changes to RadioCLI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-05-31

### Fixed

- Moved the macOS AirPlay sender bridge to optional npm dependencies so Windows
  and Linux installs do not fail while compiling an AirPlay-only native module.

## [0.1.4] - 2026-05-31

### Added

- Added a dedicated AirPlay receiver picker and AirPlay Code screen for
  passcode-protected receivers.

### Changed

- Replaced silent AirPlay target cycling with a dedicated receiver picker in
  Settings, clearer Audio output labels, immediate output switching while a
  station is playing, and explicit AirPlay receiver selection before tuning.
- AirPlay is now an explicit current-session output instead of a persisted
  default. Restarting RadioCLI returns to automatic local playback while keeping
  the last receiver available for the next manual AirPlay switch.
- Bundled the AirPlay sender bridge and updated the Homebrew formula template to
  install FFmpeg, so macOS users do not need manual AirPlay package setup.

### Fixed

- Fixed same-session AirPlay station switching so the worker retunes the active
  receiver, resets its sender buffer, and keeps the UI in buffering until the
  new stream is actually ready.
- Fixed AirPlay output failures so `skip broken streams` no longer walks
  through the library when the receiver is missing, off, local, or unavailable.
- Fixed library selection after playing a station that moves to the top of
  recents.
- Patched the bundled AirPlay sender for modern macOS AirPlay 2 receivers that
  return digest-protected setup responses or empty first setup bodies.

## [0.1.3] - 2026-05-30

### Added

- Experimental macOS AirPlay playback backend with Bonjour receiver discovery,
  Settings target selection, `:airplay-code` passcode entry, worker-based stream
  forwarding, and active receiver labels in the playback footer.

### Changed

- `ffplay` is now treated as a playback-only fallback: the UI labels it as
  `ffplay fallback`, `radiocli doctor` reports limited controls, and unsupported
  pause, mute, volume, and media-key actions explain that `mpv` is required.

### Security

- AirPlay sender support is worker-isolated and blocks high-risk sender
  dependency advisories before the backend is advertised.
- Hardened AirPlay discovery and worker messaging with bounded payloads,
  sanitized receiver data, passcode validation, and worker shutdown on startup
  timeout.

## [0.1.2] - 2026-05-30

### Fixed

- Ignored Kitty keyboard release events so Ghostty users do not skip multiple
  tabs from one left/right arrow key press.
- Ignored Kitty release events for raw media-key transport sequences so learned
  or native media keys do not double-fire on key release.

## [0.1.1] - 2026-05-30

Initial public release.

### Added

- A square braille spinner now animates to the left of the station name in the
  live playback footer while a station is buffering.
- Ink-based terminal UI with overview, now playing, library, explore, search,
  countries, world map, nearby, stats, and settings screens.
- Radio Browser provider with mirror fallback, durable cache, and tune
  resolution, plus an experimental, opt-in Radio Garden provider.
- `mpv` playback controls for readiness checks, ICY metadata polling, volume,
  pause, and mute, with `ffplay` playback fallback, sleep timer, tune timeouts,
  and skip-broken-stream behavior, using Unix sockets on macOS/Linux and named
  pipes on native Windows.
- Receiver-style Now Playing screen with 50 selectable visualizers and
  zero-signal frames whenever playback is idle, paused, stopped, or not
  backend-ready.
- Explore map: a braille world map beside the live station list with WASD
  movement, click-to-place mouse support, and a cached geotagged station atlas
  ranked by distance.
- Local-first library: recents, favorites, imports, listening activity,
  settings, learned media keys, and provider cache stored as JSON on your
  machine.
- Playlist import/export for `.m3u`, `.pls`, and `.xspf`.
- Listening stats with a 52-week local-calendar contribution graph, sessions,
  streaks, active days, and total hours listened.
- `radiocli doctor` to report local playback readiness and print OS-specific
  setup guidance.
- Published Homebrew tap formula for `brew install ciphore/tap/radiocli`.
- Documented native Linux and Windows install paths, with `winget` guidance for
  Node.js, `mpv`, and optional FFmpeg on Windows.
- Documented pnpm and Bun as optional npm-package install clients.

### Changed

- Tightened the Now Playing panel below the receiver: collapsed the stream
  tech/tags, track metadata, and backend/volume rows into two compact lines
  (track + favorite, then a single tech · tags · sleep line), dropping
  backend/volume that already appear in the header and footer. The reclaimed
  rows go to the visualizer.

[0.1.5]: https://github.com/Ciphore/RadioCLI/releases/tag/v0.1.5
[0.1.4]: https://github.com/Ciphore/RadioCLI/releases/tag/v0.1.4
[0.1.3]: https://github.com/Ciphore/RadioCLI/releases/tag/v0.1.3
[0.1.2]: https://github.com/Ciphore/RadioCLI/releases/tag/v0.1.2
[0.1.1]: https://github.com/Ciphore/RadioCLI/releases/tag/v0.1.1
