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
- Clear `f` keyboard and `:favorite` command behavior for favoriting or unfavoriting selected/current stations.
- Horizontal top tabs with arrow-key and `Tab` / `Shift+Tab` navigation across the main screens.
- Fixed top-tab shell rows so long screens cannot push navigation out of view.
- Station lists now use the available shell height more accurately while keeping the footer visible.
- Near-black app shell background with darker tab, footer, stats, and receiver surfaces.
- Stats contribution graph and legend colors now follow the persisted display color.
- Listening stats screen with a 52-week contribution graph, favorite station, session count, current and longest streaks, active days, and all-time hours listened.
- Station tuning now happens in place, so Explore/country/search/nearby lists keep their cursor and context while playback updates in the background.
