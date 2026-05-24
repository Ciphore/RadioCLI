# Radio Atlas

Radio Atlas is a terminal-first world radio receiver for exploring live public stations, tuning real streams, and keeping your listening history close to the command line.

It is built with [Ink](https://github.com/vadimdemedes/ink), [React](https://react.dev/), [Radio Browser](https://api.radio-browser.info/), and `mpv`. The goal is not a thin wrapper around a station list. The goal is a polished TUI product: fast discovery, resilient stream handling, local-first library state, and the kind of engineering surface that can grow without turning into terminal spaghetti.

## Features

- Explore public radio from around the world through country lists, global station search, a symbolic world map, and opt-in nearby discovery.
- Tune stations with `mpv` first and `ffplay` fallback when available.
- Use a receiver-style Now Playing screen with selectable spectrum/receiver visualizers, backend status, stream diagnostics, sleep timer, favorite state, volume, pause, mute, and station skipping.
- Keep shortcuts in a fixed two-line footer: page-specific controls on the first row and global transport/navigation controls on the second.
- Move previous/next through the station list you tuned from, even after navigating to another screen.
- Browse dense station lists with inline location/codec metadata and yellow favorite stars next to station names.
- Search by station name, place, language, tag, codec, or minimum bitrate.
- Keep local recents, favorites, imported stations, listening activity, playback settings, learned media keys, and provider cache.
- Review listening stats with a Tokscale-inspired tab rail, 52-week contribution graph, favorite station, sessions, streaks, active days, and total hours listened.
- Import `.m3u`, `.pls`, and `.xspf` playlists, including nested local playlists.
- Export favorites and imports as `.m3u`.
- Survive ordinary internet-radio failure modes with provider mirror fallback, stale cache fallback, corrupt-file backups, tune timeouts, and skip-broken-stream behavior.
- Resize with the terminal. The app listens for terminal resize events and recomputes list row counts, map density, receiver width, and compact-mode fallback from the current dimensions.

## Demo

The interactive TUI opens directly into the product, not a marketing screen:

```text
Radio Atlas

Overview  Explore  Countries  Search  Nearby  Now Playing  Stats  Recent  Favorites  Settings

  › 1. Explore world · Popular live stations across countries
    2. World map · Station-density atlas by country
    3. Countries · Browse by country list
    4. Search stations · Find stations by name, genre, language, place
    5. Nearby · Opt-in approximate location for local stations
    6. Now playing · Receiver display and controls
    7. Stats · Listening graph, sessions, streaks, hours
    8. Recent · Stations played on this machine
    9. Favorites · Saved and imported stations
    0. Settings · Playback backend, colors, providers

3 recent · 2 favorites · 1 imported

↑/↓ move · Enter open · 1-9/0 jump · : command
←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v display · +/- volume · q quit
```

The Now Playing screen is a framed receiver panel with 17 selectable spectrum/receiver styles. The sample below shows the default SDR analyzer; press `v` to cycle through SDR, spectrum bars, oscilloscope, signal meters, retro tuner, waterfall, cassette, equalizer, radar, blocks, LEDs, vinyl, stars, neon, matrix, hologram, and ASCII cube styles:

```text
Now playing
╭────────────────────────────────────────────────────────────────────────╮
│ FM 128.M      RADIO ATLAS                                      PLAYING │
│ KEXP 90.3 FM                                                            │
│ UNITED STATES · WASHINGTON                                              │
│ ┌[ radio-atlas-sdr ]────────────────────────────────────────────────── │
│ Freq: 101.900 MHz  |  Rate: 0.20 Msps  |  Gain: Auto                  │
│ Dyn Range: 80 dB  |  Ref Level: 0 dB  |  FPS: 15  |  PLAYING          │
│ ---------------------------------------------------------------------- │
│   -20   ·          :|::|###|:          ·       :|#|:          ·        │
│   -40   ·     :|::|#######|::|:       ·    :|#######|:       ·        │
│   -60   · :|::|###############|::|:   · :|#############|::|: ·        │
│         101.4       101.7       101.9       102.1       102.4 MHz      │
│ MP3 · 128 kbps · english                                                │
│ alternative, indie, seattle                                             │
│ Waiting for ICY track metadata                                          │
│ Backend mpv · Vol 70       ☆ NOT FAVORITE                 Sleep off     │
╰────────────────────────────────────────────────────────────────────────╯

space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b home
←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v display · +/- volume · q quit
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

Radio Atlas keeps shortcuts at the bottom of the terminal. The first footer row changes with the current screen, and the second footer row stays global:

- `←` / `→` or `Tab` / `Shift+Tab`: move across the top screen tabs.
- `F7` / `F9`, `,` / `.`, or `Shift+←` / `Shift+→`: tune previous or next station from the source list, wherever you are in the TUI.
- `space` / `F8`: pause or resume.
- `t`: cycle display color.
- `v`: cycle spectrum style.
- `+` / `-`: volume.
- `q` or `Ctrl+C`: quit cleanly.

Page-specific footer controls:

| Screen | Controls |
| --- | --- |
| Home | `↑` / `↓` move, `Enter` open, `1`-`9` / `0` jump, `:` command |
| Search input | type query, `Backspace` edit, `Enter` search or tune, `Esc` finish |
| Search results | `/` edit query, `↑` / `↓` or `n` / `p` move, `Enter` tune, `f` favorite, `b` home |
| Countries | `/` filter, `↑` / `↓` move, `Enter` open stations, `b` home |
| World map | `/` filter, `↑` / `↓` move, `Enter` open country, `b` home |
| Station lists | `↑` / `↓` or `n` / `p` move, `Enter` tune, `f` favorite, `[` / `]` page, `b` home |
| Now Playing | `space` / `F8` pause, `f` favorite, `m` mute, `s` sleep, `d` diagnostics, `b` home |
| Settings | `Enter` change selected, `g` Radio Garden, `l` location, `x` skip broken streams, `o` backend, `r` health, `b` home |
| Stats | `b` home |

Other active shortcuts:

- `Enter`: open the selected item or tune the selected station without leaving the current list.
- `:`: command palette.
- `/`: edit search or country filter on screens that support it.
- `[` / `]`: page through long station and country lists.
- `m`: mute.
- `o`: cycle playback backend.
- `g`: toggle the experimental Radio Garden adapter.
- `l`: toggle nearby location lookup.
- `x`: toggle skip-broken-stream behavior.
- `r`: refresh provider health.
- `f`: favorite the current or selected station.
- `n` / `p`: move selection; on Now Playing, tune next or previous station from the source list.
- `s`: cycle the sleep timer on Now Playing through off, 15 minutes, 30 minutes, 60 minutes, then off again.
- `d`: stream diagnostics on Now Playing.
- `b`: back home.

When you tune a station from Explore, Countries, Search, Nearby, Recent, or Favorites, that list becomes the playback queue. Previous/next keeps moving through that source list from any screen until you tune from another list.

Hardware media keys depend on the OS and terminal. Radio Atlas enables enhanced keyboard reporting where supported, recognizes common F7/F8/F9, Kitty consumer/media-key codes, modified-arrow sequences, and learned custom bindings. Learn keys from Settings or with `:learn previous`, `:learn play`, and `:learn next`; clear them with `:keys reset`.

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
:sleep off
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

Settings persist display colors and spectrum/receiver styles without editing config files. The stats graph and legend follow the selected display color, and the selected Now Playing style is restored on the next launch.

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
- source-list playback queues for previous/next transport
- enhanced terminal keyboard parsing with learned media-key bindings
- local-first privacy posture for history, favorites, imports, and settings
- responsive terminal layout utility with a fixed two-row footer and focused tests
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
npm run verify
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
