# Changelog

## 0.1.0

- Initial public-ready Radio Atlas release.
- Ink TUI with home, map, country, search, nearby, now-playing, stats, recent, favorites/imports, and settings screens.
- Radio Browser provider with mirror fallback, durable cache, tune resolution, and live smoke coverage.
- Experimental Radio Garden provider behind an explicit setting.
- `mpv` playback with `ffplay` fallback, readiness checks, metadata polling, volume, pause, mute, sleep timer, diagnostics, tune timeout, and skip-broken-stream behavior.
- Local JSON store for recents, favorites, imports, listening activity, and settings.
- Playlist import/export for `.m3u`, `.pls`, and `.xspf`.
- Responsive terminal layout utility and tests.
- Open-source project files, CI, issue templates, security policy, contribution guide, docs, npm pack check, and fresh-install package smoke test.
- Resize-aware terminal layout via Ink window-size events.
- Expanded display colors and receiver visualizer styles for Now Playing, with an SDR-style spectrum analyzer default and slimmer alternate bars.
- Added an animated ASCII cube receiver style inspired by terminal 3D demos.
- Clear `f` keyboard and `:favorite` command behavior for favoriting or unfavoriting selected/current stations.
- Yellow favorite stars now appear inline next to station names, with station description/metadata aligned to the right for faster scanning.
- Horizontal top tabs with arrow-key and `Tab` / `Shift+Tab` navigation across the main screens.
- Fixed top-tab shell rows so long screens cannot push navigation out of view.
- Station lists now use the available shell height more accurately while keeping the footer visible.
- Screen shortcut legends now live in the fixed bottom footer instead of inside page content.
- Added page-aware footer shortcuts plus global `t` display-color, `v` spectrum-style, `o` backend, `g` Radio Garden, `l` location, `x` skip-broken-stream, and `r` health-refresh shortcuts.
- Added source-list playback queues so previous/next continues through the station list the user tuned from, even after navigating elsewhere.
- Expanded transport compatibility with common F7/F8/F9 sequences, Kitty media-key reporting, modified-arrow fallback, and learned custom media-key bindings.
- Added Settings and command-palette flows for learning custom previous, play/pause, and next media keys, plus resetting learned bindings.
- Updated sleep timer cycling so the `s` shortcut rotates through off, 15 minutes, 30 minutes, 60 minutes, and back to off.
- Removed placeholder shortcut labels from visualizer content when no action was wired to them.
- Near-black app shell background with darker tab, footer, stats, and receiver surfaces.
- Stats contribution graph and legend colors now follow the persisted display color.
- Stats now bucket listening sessions by local calendar day instead of UTC day, so late-night listening correctly appears across consecutive local days.
- Listening stats screen with a 52-week contribution graph, favorite station, session count, current and longest streaks, active days, and all-time hours listened.
- Station tuning now happens in place, so Explore/country/search/nearby lists keep their cursor and context while playback updates in the background.
- Now Playing metadata now cleans key/value radio payloads such as `title="..." artist="..."` into readable track text.
- Added release verification scripts for unused-code checks, whitespace checks, export checks, package linting, package dry-run, fresh-install smoke testing, and full release verification.
