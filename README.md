# Radio Atlas

Radio Atlas is a terminal-first world radio receiver for exploring live public stations, tuning real streams, and keeping your listening history close to the command line.

It is built with [Ink](https://github.com/vadimdemedes/ink), [React](https://react.dev/), [Radio Browser](https://api.radio-browser.info/), and `mpv`. The goal is not a thin wrapper around a station list. The goal is a polished TUI product: fast discovery, resilient stream handling, local-first library state, and the kind of engineering surface that can grow without turning into terminal spaghetti.

## Features

- Explore public radio from around the world through country lists, global station search, a symbolic world map, and opt-in nearby discovery.
- Tune stations with `mpv` first and `ffplay` fallback when available.
- Use a receiver-style Now Playing screen with selectable visualizers, backend status, stream diagnostics, sleep timer, favorite state, volume, pause, mute, and station skipping.
- Search by station name, place, language, tag, codec, or minimum bitrate.
- Keep local recents, favorites, imported stations, listening activity, playback settings, and provider cache.
- Review listening stats with a Tokscale-inspired tab rail, 52-week contribution graph, favorite station, sessions, streaks, active days, and total hours listened.
- Import `.m3u`, `.pls`, and `.xspf` playlists, including nested local playlists.
- Export favorites and imports as `.m3u`.
- Survive ordinary internet-radio failure modes with provider mirror fallback, stale cache fallback, corrupt-file backups, tune timeouts, and skip-broken-stream behavior.
- Resize with the terminal. The app listens for terminal resize events and recomputes list row counts, map density, receiver width, and compact-mode fallback from the current dimensions.

## Demo

The interactive TUI opens directly into the product, not a marketing screen:

```text
Radio Atlas

  › Explore world
    World map
    Countries
    Search
    Nearby
    Now Playing
    Stats
    Recent
    Favorites
    Settings

←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v · q quit
```

The Now Playing screen is styled like a compact receiver display:

```text
Now playing
╭────────────────────────────────────────────────────────────────────────╮
│ FM 128.M      RADIO ATLAS                                      PLAYING │
│ KEXP 90.3 FM                                                            │
│ UNITED STATES · WASHINGTON                                              │
│ ▁▂▃▄▅▆▇█▁▂▃▄▅▆▇█▁▂▃▄▅▆▇█▁▂▃▄▅▆▇█▁▂▃▄▅▆▇█▁▂                         │
│ MP3 · 128 kbps · english                                                │
│ Backend mpv · Vol 70       ☆ NOT FAVORITE                 Sleep off     │
│ space/F8 pause · +/- volume · m mute · s sleep · F7/F9 station · d diag │
╰────────────────────────────────────────────────────────────────────────╯
```

For the exact non-interactive demo transcript:

```bash
npm run demo:script
```

Recording instructions live in [docs/DEMO.md](docs/DEMO.md).

## Install

Requirements:

- Node.js 22 or newer
- `mpv` for best playback
- `ffplay` from FFmpeg as an optional fallback

macOS:

```bash
brew install mpv ffmpeg
npm install -g radio-atlas
radio-atlas
```

Local checkout:

```bash
git clone https://github.com/Ciphore/RadioCLI.git
cd RadioCLI
npm ci
npm run build
npm link
radio-atlas
```

If you do not want to link the package globally:

```bash
npm run dev
```

## CLI Usage

```bash
radio-atlas                 # Start the TUI
radio-atlas check           # Show local store path, playback backends, provider health
radio-atlas countries       # Print top countries by station count
radio-atlas search "japan hits"
radio-atlas import stations.m3u
radio-atlas export favorites.m3u
radio-atlas add-url <stream-url> [station name]
```

After a local build, the same commands can be run with:

```bash
node dist/cli.js check
node dist/cli.js search "lagos talk"
```

## TUI Controls

- `1`-`9`: jump from the home menu.
- `←` / `→`: move across the top screen tabs.
- `Tab` / `Shift+Tab`: move across the top screen tabs.
- `Enter`: open the selected item or tune the selected station without leaving the current list.
- `:`: command palette.
- `/`: edit search or country filter on screens that support it.
- `[` / `]`: page through long station and country lists.
- `+` / `-`: volume.
- `m`: mute.
- `t`: cycle display color.
- `v`: cycle spectrum style.
- `o`: cycle playback backend.
- `g`: toggle the experimental Radio Garden adapter.
- `l`: toggle nearby location lookup.
- `x`: toggle skip-broken-stream behavior.
- `r`: refresh provider health.
- `space` / `F8`: pause or resume.
- `f`: favorite the current or selected station.
- `n` / `p`: move selection; on Now Playing, tune next or previous station from the source list.
- `F7` / `F9`, `,` / `.`, or `Shift+←` / `Shift+→`: tune previous or next station from the source list, wherever you are in the TUI.
- `s`: sleep timer on Now Playing.
- `d`: stream diagnostics on Now Playing.
- `b`: back home.
- `q` or `Ctrl+C`: quit cleanly.

Hardware media keys depend on the OS and terminal. Radio Atlas enables enhanced keyboard reporting where supported, recognizes common F7/F8/F9, Kitty media-key, and modified-arrow sequences, and lets you learn custom keys from Settings or with `:learn previous`, `:learn play`, and `:learn next`.

Useful command palette entries:

```text
:search lagos jazz
:country japan
:codec MP3
:language spanish
:bitrate 128
:clear
:volume 60
:mute
:favorite
:sleep 15
:timeout 15
:skip off
:location on
:learn previous
:learn play
:learn next
:keys reset
:map
:stats
:recent
:favorites
:settings
:stop
```

Settings persist display colors and spectrum styles without editing config files. The stats graph and legend follow the selected display color. The default spectrum style is an SDR-inspired display, with spectrum bars, an oscilloscope, and signal meters available when you want a different display.

## Architecture

Radio Atlas is split around four seams:

- TUI state and screens in `src/ui`
- provider adapters in `src/providers`
- playback lifecycle and metadata in `src/player`
- local JSON persistence in `src/storage`

Radio Browser is the primary provider. Its own docs recommend using a speaking user agent, resolving station clicks through `/json/url`, and retrying with other servers when one fails; Radio Atlas follows that shape with mirror fallback and durable cache. Radio Garden support is experimental because the useful endpoints are publicly discoverable but unofficial, and they can be blocked or changed independently of this project.

Playback prefers `mpv` because it handles real-world streams, redirects, HLS, codecs, and metadata better than a hand-rolled stream client. Radio Atlas controls `mpv` through JSON IPC for readiness, pause, mute, volume, and metadata polling.

Read more:

- [Architecture](docs/ARCHITECTURE.md)
- [Design notes](docs/DESIGN_NOTES.md)
- [Reliability](docs/RELIABILITY.md)
- [Roadmap](docs/ROADMAP.md)

## Engineering Highlights

This repo is intentionally small, but it is built like production software:

- provider boundary instead of UI-coupled fetch calls
- Zod schemas at public API and persistence boundaries
- stale-cache fallback for directory outages
- corrupt store/cache backup instead of silent overwrite
- `mpv` readiness checks before reporting playback as active
- tune timeout and skip-broken-stream behavior
- local-first privacy posture for history, favorites, imports, and settings
- responsive terminal layout utility with focused tests
- smoke tests that exercise live provider data and real playback
- package smoke test that packs the npm artifact, installs it into a fresh temp project, and runs the installed binary

## Privacy

Nearby station discovery is off by default. If you enable it, Radio Atlas uses approximate IP-based location through `ipapi.co` to request nearby stations. The app does not require an account, does not store secrets, and does not proxy audio. It stores recents, favorites, imports, settings, and provider cache data locally on your machine.

## Development

```bash
npm ci
npm run check
npm run lint
npm run test
npm run build
npm run smoke:data
npm run smoke:playback
npm run pack:check
npm run fresh:check
npm run verify:release
```

`npm run smoke:playback` briefly opens a public stream through your local playback backend.

## Contributing

Contributions are welcome when they keep the app practical, reliable, and honest about public radio streams. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and include `radio-atlas check` output for playback issues.

## References

- [Ink README](https://github.com/vadimdemedes/ink)
- [Radio Browser API docs](https://api.radio-browser.info/)
- [mpv JSON IPC manual](https://mpv.io/manual/stable/#json-ipc)
- [Unofficial Radio Garden OpenAPI notes](https://github.com/jonasrmichel/radio-garden-openapi)

## License

MIT. See [LICENSE](LICENSE).
