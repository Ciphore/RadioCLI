# RadioCLI

RadioCLI is a terminal-first world radio receiver for exploring live public stations, tuning real streams, and keeping your listening history close to the command line.

It is built with [Ink](https://github.com/vadimdemedes/ink), [React](https://react.dev/), [Radio Browser](https://api.radio-browser.info/), and `mpv`. The goal is not a thin wrapper around a station list. The goal is a polished TUI product: fast discovery, resilient stream handling, local-first library state, and the kind of engineering surface that can grow without turning into terminal spaghetti.

## Features

- Explore public radio from around the world through a cosmo-style braille world map beside the station list, with click-to-place mouse support and WASD keyboard movement backed by a cached geotagged station atlas. Country lists, global station search, a country-density map, and opt-in nearby discovery round out the discovery surface.
- Tune stations with `mpv` first and `ffplay` fallback when available.
- Use a receiver-style Now Playing screen with 25 selectable spectrum/receiver visualizers, backend status, cleaned ICY track metadata, stream diagnostics, sleep timer, favorite state, volume, pause, mute, station skipping, and zero-signal graphics whenever playback is idle, paused, stopped, or not backend-ready.
- Keep shortcuts in a fixed adaptive footer: a compact live station and track row appears above page-specific and global controls while playback is active.
- Move previous/next through the exact station list you tuned from, even after navigating to another screen.
- Browse dense station lists with inline location/codec metadata and yellow favorite stars next to station names.
- Search by station name, place, language, tag, codec, or minimum bitrate.
- Keep local recents, favorites, imported stations, listening activity, playback settings, learned media keys, and provider cache.
- Review listening stats with a Tokscale-inspired tab rail, local-calendar contribution graph, favorite station, thresholded stations listened, sessions, streaks, active days, and total hours listened from persisted sessions.
- Import `.m3u`, `.pls`, and `.xspf` playlists, including nested local playlists.
- Export favorites and imports as `.m3u`.
- Survive ordinary internet-radio failure modes with provider mirror fallback, stale cache fallback, corrupt-file backups, tune timeouts, and skip-broken-stream behavior.
- Resize with the terminal. The app listens for terminal resize events and recomputes list row counts, map density, receiver width, and compact-mode fallback from the current dimensions.

## Demo

The interactive TUI opens directly into the product, not a marketing screen:

```text
RadioCLI

Overview  Playing  Library  Explore  Search  Countries  Nearby  Stats  Settings

  › 1. Playing · Receiver display and controls
    2. Library · Favorites, recent stations, imported streams
    3. Explore · Move a map cursor through geotagged stations
    4. Search · Find stations by name, genre, language, place
    5. Countries · Browse by country list with a world-map toggle
    6. Nearby · Opt-in approximate location for local stations
    7. Stats · Listening graph, sessions, streaks, hours
    8. Settings · Playback backend, colors, providers

3 recent · 2 favorites · 1 imported

↑/↓ move · Enter open · number jump · : command
←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v display · +/- volume · q quit
```

The Now Playing screen is a framed receiver panel with 130 selectable spectrum/receiver styles. The sample below shows the default fast spectrum bars; press `v` to cycle through the core RadioCLI receiver styles plus the full Termflix-inspired animation catalog. The curated receiver set also includes VU meters, a wireframe mesh, ribbon, orbits, a spinning vinyl turntable, mirrored bars, a scrolling soundwave, a perspective tunnel, kaleidoscope, constellation, pulse grid, and a Lissajous scope; a high-resolution braille tier — a smooth braille waveform, a polar radial-EQ, a scrolling spectrogram, a drifting nebula, flowing silk, a ripple-tank interference field, a phyllotaxis sunflower, a decaying harmonograph, sub-cell bloom bars, hypnotic moiré, a spiral galaxy, and underwater caustics; a generative/3D tier — a Lorenz attractor, a Barnsley fern, a Chladni plate, a spirograph, a rotating tesseract, a torus knot, 3D spectrum mountains, an analog tuning dial, an RF constellation diagram, a rotozoomer, a swaying fractal tree, and a morphing Julia set; and a further set of Clifford and de Jong attractors, Truchet tiles, a wireframe sphere, a Möbius strip, an S-meter, a goniometer/vectorscope, copper bars, a twister, DLA coral, a cyclone, a jellyfish, a lava lamp, a Newton fractal, and a prism. Termflix entries that overlap existing RadioCLI names are exposed as termflix-fire, termflix-matrix, termflix-plasma, termflix-starfield, termflix-waterfall, and termflix-radar; the rest of the added catalog includes wave, life, particles, pendulum, rain, fountain, flow, spiral, ocean, aurora, lightning, smoke, ripple, snow, garden, fireflies, DNA, pulse, boids, lava, sandstorm, petals, campfire, eclipse, blackhole, rainforest, crystallize, hackerman, visualizer, cells, atom, automata, globe, dragon, Sierpinski, Mandelbrot, maze, metaballs, nbody, Langton, sort, Tetris, snake, invaders, Pong, Flappy Bird, reaction diffusion, and Voronoi. Visualizers animate only while playback is actually playing and backend-ready; paused, stopped, idle, loading, and error states render a flat zero-signal display instead of a frozen waveform:

```text
Now playing
╭────────────────────────────────────────────────────────────────────────╮
│ FM 128.M      RADIOCLI                                           PLAYING │
│ KEXP 90.3 FM                                                            │
│ UNITED STATES · WASHINGTON                                              │
│      ▌       ▌     ▌       ▌       ▌       ▌       ▌       ▌           │
│  ▌   ▌   ▌   ▌ ▌   ▌   ▌   ▌   ▌   ▌   ▌   ▌   ▌   ▌   ▌   ▌           │
│  ▌ ▌ ▌   ▌ ▌ ▌ ▌ ▌ ▌   ▌ ▌ ▌   ▌ ▌ ▌   ▌ ▌ ▌   ▌ ▌ ▌   ▌ ▌ ▌           │
│  ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌           │
│  ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌           │
│  ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌ ▌           │
│ MP3 · 128 kbps · english                                                │
│ alternative, indie, seattle                                             │
│ Waiting for ICY track metadata                                          │
│ Backend mpv · Vol 70       ☆ NOT FAVORITE                 Sleep off     │
╰────────────────────────────────────────────────────────────────────────╯

Playing: KEXP 90.3 FM · Now: Artist - Track · Seattle, Washington, United States · MP3 / 128 kbps / english · mpv · playing · vol 70 · Nearby 4/90
space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b home
←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v display · +/- volume · q quit
```

For the exact non-interactive demo transcript:

```bash
npm run demo:script
```

Recording instructions live in [docs/DEMO.md](docs/DEMO.md).

## Documentation Website

The public website and the manual now live together in `apps/docs`, a Fumadocs-powered Next app. It renders the homepage at `/`, the documentation tree at `/docs`, docs search at `/api/search`, generated page images, and LLM-readable text routes.

Docs content is written as MDX in `apps/docs/content/docs`, with the navigation tree defined by the local `meta.json` files.

Useful commands from the repo root:

```bash
npm run docs:dev
npm run docs:check
npm run docs:build
```

Set `NEXT_PUBLIC_SITE_URL` for the canonical public docs URL. Preview builds also read Vercel's `VERCEL_URL` and Cloudflare Pages' `CF_PAGES_URL`.

## Install

Requirements:

- Node.js 22 or newer
- `mpv` for best playback; RadioCLI expects one local playback backend at runtime
- `ffplay` from FFmpeg as an optional fallback

NPM installs RadioCLI and its JavaScript dependencies. It does not install native
system playback tools. Use `radiocli doctor` after installation to check local
playback readiness and get the right setup command for your OS:

```bash
npm install -g radiocli
radiocli doctor
radiocli
```

macOS with npm:

```bash
brew install mpv
npm install -g radiocli
radiocli
```

Linux with npm:

```bash
sudo apt install mpv
npm install -g radiocli
radiocli
```

`ffplay` is optional fallback support. Install FFmpeg separately if you want it:

```bash
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Debian/Ubuntu
```

The repo also includes a Homebrew formula template in `packaging/homebrew` for a
native one-command macOS tap. Once the tap formula is published, the intended
Homebrew install path is:

```bash
brew install ciphore/tap/radiocli
```

That formula depends on `node` and `mpv`, keeping native dependencies in the
native package manager instead of running system installs from npm.

CI covers command-mode typecheck, tests, builds, and package checks on Ubuntu. Native Windows terminals are not release-tested yet; use WSL with Linux `mpv` / `ffplay` for the supported path.

Local checkout:

```bash
git clone https://github.com/Ciphore/RadioCLI.git
cd RadioCLI
npm ci
npm run build
npm link
radiocli
```

If you do not want to link the package globally:

```bash
npm run dev
```

## CLI Usage

```bash
radiocli                 # Start the TUI
radiocli check           # Show local store path, playback backends, provider health
radiocli doctor          # Show playback setup status and install guidance
radiocli countries       # Print top countries by station count
radiocli search "japan hits"
radiocli import stations.m3u
radiocli export favorites.m3u
radiocli add-url <stream-url> [station name]
```

`radiocli export` writes `radiocli-favorites.m3u` when no output path is provided.

After a local build, the same commands can be run with:

```bash
node dist/cli.js check
node dist/cli.js search "lagos talk"
```

## TUI Controls

RadioCLI keeps shortcuts at the bottom of the terminal. When playback is active, a compact live row sits above the shortcuts with station, cleaned track metadata, volume or mute state, and an active sleep timer. The page shortcut row changes with the current screen, and the global transport row stays global:

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
| Home | `↑` / `↓` move, `Enter` open, number jump, `:` command |
| Search input | type query, `Backspace` edit, `Enter` search or tune, `Esc` finish |
| Search results | `/` edit query, `↑` / `↓` or `n` / `p` move, `Enter` tune, `f` favorite, `b` home |
| Explore | click map, `WASD` fine move, `Shift+WASD` jump, `↑` / `↓` station, `Enter` tune, `f` favorite, `[` / `]` page, `b` home |
| Countries | `/` filter, `↑` / `↓` move, `Enter` open stations, `w` map, `b` home |
| World map | `/` filter, `↑` / `↓` move, `Enter` open country, `w` list, `b` home |
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

When you tune a station from Library, Explore, Search, Countries, or Nearby, that list becomes the playback queue. Previous/next keeps moving through that source list from any screen until you tune from another list.

Hardware media keys depend on the OS and terminal. RadioCLI maximizes compatibility by enabling enhanced keyboard reporting where supported, recognizing common F7/F8/F9 sequences, Kitty consumer/media-key codes, modified-arrow sequences, comma/dot transport fallback, and learned custom bindings. Learn keys from Settings or with `:learn previous`, `:learn play`, and `:learn next`; clear them with `:keys reset`.

Explore mouse clicks use terminal mouse reporting while the Explore tab is active. If your terminal or tmux setup does not pass those events through, the WASD cursor controls stay fully available.

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
:library
:stats
:settings
:stop
```

Settings persist display colors and spectrum/receiver styles without editing config files. The nine display colors are green, amber, blue, ruby, ice, teal, violet, copper, and mono. The 115 receiver styles include the original spectrum, oscilloscope, waterfall, cassette, equalizer, audioMotion-style, radar, blocks, LEDs, stars, matrix, hologram, ASCII cube, fire, fireworks, plasma, radio waves, raindrops, spinning donut, and starfield displays; the curated additions VU meters, wireframe mesh, ribbon, orbits, vinyl turntable, mirrored bars, scrolling soundwave, perspective tunnel, kaleidoscope, constellation, pulse grid, and Lissajous scope; the high-resolution braille tier of braille waveform, radial EQ, spectrogram, nebula, silk, ripple tank, phyllotaxis, harmonograph, bloom bars, moiré, galaxy, and caustics; the generative/3D tier of Lorenz attractor, Barnsley fern, Chladni plate, spirograph, tesseract, torus knot, 3D spectrum mountains, analog tuning dial, RF constellation, rotozoomer, fractal tree, and Julia set; the Clifford and de Jong attractors, Truchet tiles, wireframe sphere, Möbius strip, S-meter, goniometer, copper bars, twister, DLA coral, cyclone, jellyfish, lava lamp, Newton fractal, and prism; plus the added Termflix-inspired catalog entries. The stats graph and legend follow the selected display color, and the selected Now Playing style is restored on the next launch.

## Architecture

RadioCLI is split around four seams:

- TUI state and screens in `src/ui`
- provider adapters in `src/providers`
- playback lifecycle and metadata in `src/player`
- local JSON persistence in `src/storage`

Radio Browser is the primary provider. Its own docs recommend using a speaking user agent, resolving station clicks through `/json/url`, and retrying with other servers when one fails; RadioCLI follows that shape with mirror fallback and durable cache. Explore and Nearby use a cached geotagged Radio Browser atlas, then compute local distance in the app so map movement is not biased toward the most-clicked stations worldwide. Radio Garden support is experimental because the useful endpoints are publicly discoverable but unofficial, and they can be blocked or changed independently of this project.

Playback prefers `mpv` because it handles real-world streams, redirects, HLS, codecs, and metadata better than a hand-rolled stream client. RadioCLI controls `mpv` through JSON IPC for readiness, pause, mute, volume, and metadata polling.

The npm package and executable are both `radiocli`. Current installs store data under RadioCLI paths such as `radiocli.json` and `radiocli-cache.json`. Existing Radio Atlas data is still discovered when a new RadioCLI store does not exist, and legacy `RADIO_ATLAS_HOME` / animation environment variables remain supported as migration fallbacks. New automation should use `RADIOCLI_HOME` and `RADIOCLI_DISABLE_ANIMATION`.

Read more:

- [Architecture](docs/ARCHITECTURE.md)
- [Design notes](docs/DESIGN_NOTES.md)
- [Reliability](docs/RELIABILITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Release packaging](docs/RELEASE_PACKAGING.md)

## Engineering Highlights

This repo is intentionally small, but it is built like production software:

- provider boundary instead of UI-coupled fetch calls
- cached geotagged station atlas for true distance-first Explore and Nearby results
- Zod schemas at public API and persistence boundaries
- stale-cache fallback for directory outages
- corrupt store/cache backup instead of silent overwrite
- `mpv` readiness checks before reporting playback as active
- tune timeout and skip-broken-stream behavior
- cleaned ICY metadata, including key/value payloads such as `title="..." artist="..."` and station-specific `text="..."` fields
- source-list playback queues for previous/next transport
- enhanced terminal keyboard parsing with learned media-key bindings
- local-calendar activity bucketing for late-night listening sessions
- local-first privacy posture for history, favorites, imports, and settings
- responsive terminal layout utility with an adaptive footer and focused tests
- smoke tests that exercise live provider data and real playback
- package smoke test that packs the npm artifact, installs it into a fresh temp project, and runs the installed binary

## Privacy

Nearby station discovery is off by default. If you enable it, RadioCLI requests approximate IP-based location from `ipapi.co` and uses the returned city/region/country/coordinates to sort the local geotagged station atlas. Explore uses only the cursor coordinate you move in the terminal. The app does not require an account, does not store secrets, and does not proxy audio. It stores recents, favorites, imports, settings, and provider cache data locally on your machine.

## Development

```bash
npm ci
npm run check
npm run lint
npm run test
npm run build
npm run docs:check
npm run docs:build
npm run smoke:data
npm run verify
npm run smoke:playback
npm run pack:check
npm run fresh:check
npm run verify:release
```

`npm run smoke:playback` briefly opens a public stream through your local playback backend.

## Contributing

Contributions are welcome when they keep the app practical, reliable, and honest about public radio streams. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and include `radiocli check` output for playback issues.

## References

- [Ink README](https://github.com/vadimdemedes/ink)
- [Radio Browser API docs](https://api.radio-browser.info/)
- [mpv JSON IPC manual](https://mpv.io/manual/stable/#json-ipc)
- [Unofficial Radio Garden OpenAPI notes](https://github.com/jonasrmichel/radio-garden-openapi)

## License

MIT. See [LICENSE](LICENSE).
