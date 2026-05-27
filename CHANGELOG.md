# Changelog

## Unreleased

- No unreleased changes yet.

## 0.1.0 - 2026-05-25

### Brand And Packaging

- Initial public-ready RadioCLI release.
- Rebranded the project, npm package, executable, docs, issue templates, scripts, user agents, temporary socket names, and default export filename from Radio Atlas / `radio-atlas` to RadioCLI / `radiocli`.
- Added RadioCLI storage/cache paths and `RADIOCLI_HOME`, while preserving old Radio Atlas default paths and `RADIO_ATLAS_HOME` as migration fallbacks.
- Added release verification scripts for unused-code checks, whitespace checks, export checks, package linting, package dry-run, fresh-install smoke testing, playback smoke testing, and full release verification.

### Documentation Website

- Combined the public website and documentation into a Fumadocs-powered Next app in `apps/docs`, with the homepage at `/` and the documentation tree at `/docs`.
- Migrated the product manual into MDX pages for overview, installation, CLI usage, TUI controls, demo, architecture, design notes, reliability, privacy/security, contributing, release history, and roadmap.
- Added docs search at `/api/search`, generated Open Graph images, Markdown copy/view options, GitHub source links, and LLM-readable text routes.
- Added root `docs:dev`, `docs:check`, and `docs:build` scripts, plus docs CI and Dependabot coverage for the docs app.

### App Surface

- Ink TUI with home, explore, country, search, nearby, world map, now-playing, stats, recent, favorites/imports, and settings screens.
- Horizontal top tabs with arrow-key and `Tab` / `Shift+Tab` navigation across the main screens.
- Fixed top-tab shell rows so long screens cannot push navigation out of view.
- Near-black app shell background with darker tab, footer, stats, and receiver surfaces.
- Resize-aware terminal layout via Ink window-size events, including recomputed list row counts, map density, receiver width, compact-mode fallback, and an adaptive footer.
- Replaced the placeholder world-map blobs with a country-coordinate density map that uses the full terminal width and labels high-station countries.

### Playback And Station Flow

- Radio Browser provider with mirror fallback, durable cache, tune resolution, and live smoke coverage.
- Experimental Radio Garden provider behind an explicit setting.
- `mpv` playback with `ffplay` fallback, readiness checks, metadata polling, volume, pause, mute, sleep timer, diagnostics, tune timeout, and skip-broken-stream behavior.
- Station tuning now happens in place, so Explore/country/search/nearby lists keep their cursor and context while playback updates in the background.
- Added source-list playback queues so previous/next continues through the station list the user tuned from, even after navigating elsewhere.
- Added a persistent live playback footer row that follows the active station across every tab with station, metadata, backend, volume, queue, and sleep-timer details.
- Now Playing metadata now cleans key/value radio payloads such as `title="..." artist="..."` into readable track text.

### Controls And Settings

- Added page-aware footer shortcuts plus global `t` display-color, `v` spectrum-style, `o` backend, `g` Radio Garden, `l` location, `x` skip-broken-stream, and `r` health-refresh shortcuts.
- Expanded transport compatibility with common F7/F8/F9 sequences, Kitty media-key reporting, modified-arrow fallback, comma/dot fallback, and learned custom media-key bindings.
- Added Settings and command-palette flows for learning custom previous, play/pause, and next media keys, plus resetting learned bindings.
- Updated sleep timer cycling so the `s` shortcut rotates through off, 15 minutes, 30 minutes, 60 minutes, and back to off.
- Clear `f` keyboard and `:favorite` command behavior for favoriting or unfavoriting selected/current stations.
- Removed placeholder shortcut labels from visualizer content when no action was wired to them.

### Visualizers And Lists

- Expanded display colors and receiver visualizer styles for Now Playing, with 23 selectable styles, an SDR-style spectrum analyzer default, and slimmer alternate bars.
- Added audioMotion-style bars, blob waves, split-area scopes, dotted amplitude fields, contour rings, and braided oscilloscopes to the receiver style set.
- Added an animated ASCII cube receiver style inspired by terminal 3D demos.
- Yellow favorite stars now appear inline next to station names, with station description/metadata aligned to the right for faster scanning.
- Station lists now use the available shell height more accurately while keeping the footer visible.
- Screen shortcut legends now live in the fixed bottom footer instead of inside page content.

### Stats And Persistence

- Local JSON store for recents, favorites, imports, listening activity, playback settings, learned media keys, and provider cache.
- Playlist import/export for `.m3u`, `.pls`, and `.xspf`.
- Listening stats screen with a 52-week contribution graph, favorite station, session count, current and longest streaks, active days, favorite time, and all-time hours listened.
- Stats contribution graph and legend colors now follow the persisted display color.
- Stats now bucket listening sessions by local calendar day instead of UTC day, so late-night listening correctly appears across consecutive local days.

### Open Source Readiness

- Open-source project files, CI, issue templates, security policy, contribution guide, docs, npm pack check, and fresh-install package smoke test.
- Responsive terminal layout utility and tests.
