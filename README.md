# RadioCLI

Discover and stream stations from around the world without leaving your
terminal. No account. No cloud library.

[![CI](https://github.com/Ciphore/RadioCLI/actions/workflows/ci.yml/badge.svg)](https://github.com/Ciphore/RadioCLI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

![RadioCLI Now Playing visualizer demo](apps/docs/public/demo/radiocli-now-playing.gif)

## Features

RadioCLI pairs a keyboard-first interface with the open
[Radio Browser](https://api.radio-browser.info/) directory and dependable
playback through `mpv`.

- **Discovery:** Global search and filters, country browsing, a station-density
  map, an interactive world map, nearby stations, and an optional experimental
  Radio Garden provider.
- **Playback:** Live metadata, track history, 60+ terminal visualizers, receiver
  styles, color themes, sleep timers, diagnostics, learned media keys, and
  previous/next queues based on the station list you opened.
- **AirPlay:** Select and switch to discovered receivers through the experimental
  macOS output, including passcode entry when a receiver requires it.
- **Custom stations:** Add direct HTTP(S) streams with automatic ICY metadata,
  import `.m3u`, `.pls`, and `.xspf` playlists, and export an `.m3u` library.
- **Local library:** Favorites, recents, imports, track history, settings, and
  JSON backup and restore stay on your machine.
- **Listening stats:** Sessions, streaks, active days, total listening time, and
  a 52-week activity graph.
- **Alarms:** One-time and recurring schedules with station fallback, independent
  volume, fade-in, auto-stop, snooze, missed-run grace, native OS scheduling,
  and optional Alarm Guard.
- **Agent control:** An optional local Model Context Protocol (MCP) server gives
  supported coding tools typed access to discovery, playback, favorites, stats,
  alarms, AirPlay, and appearance. `radiocli agent` exposes the same controls to
  other local tools.
- **Terminal support:** Full, compact, and micro layouts; keyboard, mouse, and
  trackpad input; Unicode and ASCII rendering; reduced motion; screen-reader,
  limited-color, no-color, transparent-background, offline, and low-bandwidth
  modes.

## Install

**Homebrew**

```bash
brew install ciphore/tap/radiocli
radiocli
```

**npm**

```bash
npm install -g @ciphore/radiocli
radiocli setup
radiocli
```

RadioCLI requires Node.js 22 or newer. `radiocli setup` can install and verify
the native playback tools available on macOS, Linux, and Windows.

Need a different package route, AirPlay setup, or a fallback player? See the
[installation guide](apps/docs/content/docs/getting-started/install.mdx) and
[platform matrix](apps/docs/content/docs/platforms.mdx).

## Screenshots

**Explore**

![World map discovery in RadioCLI Explore](apps/docs/public/demo/radiocli-explore-map.gif)

**Search**

![Station search results in RadioCLI](apps/docs/public/demo/radiocli-search.gif)

**Library**

![Favorites and recent stations in the RadioCLI Library](apps/docs/public/demo/radiocli-library.gif)

**Nearby**

![Nearby stations in RadioCLI](apps/docs/public/demo/radiocli-nearby.gif)

**Stats**

![Local listening stats with selectable display colors](apps/docs/public/demo/radiocli-stats-colors.gif)

## Controls

| Key | Action |
| --- | --- |
| `←` / `→` or `Tab` / `Shift+Tab` | Switch screens |
| `↑` / `↓` or `n` / `p` | Move the selection |
| `Enter` | Open or tune the selection |
| `space` or `F8` | Pause or resume |
| `,` / `.` or `F7` / `F9` | Previous or next station |
| `+` / `-` | Change volume |
| `f` | Save or remove a favorite |
| `:` | Open the command palette |
| `?` | Show every shortcut |
| `q` | Quit |

The footer always shows the controls that matter on the current screen. The
[controls guide](apps/docs/content/docs/getting-started/tui-controls.mdx) covers
playback, filters, media keys, AirPlay, and commands.

## CLI and agent control

RadioCLI also works as a scriptable CLI, so the same library is available to
shell scripts and local development tools.

```bash
radiocli search "japan hits"
radiocli countries
radiocli import https://example.com/live.mp3
radiocli export favorites.m3u
radiocli alarm list
radiocli check
radiocli doctor --json
```

Run `radiocli setup --mcp` or enable **Agent control & MCP** in Settings to expose
typed local tools for discovery, playback, favorites, stats, alarms, AirPlay,
and receiver customization. See the
[CLI guide](apps/docs/content/docs/getting-started/cli.mdx) for the complete
command and agent-control reference.

## Alarms

Set one-time or recurring alarms that reopen RadioCLI through launchd on macOS,
systemd on Linux, or Task Scheduler on Windows. Station fallback, snooze,
missed-run grace, and Alarm Guard help make scheduled playback more resilient.

Alarms are experimental. A computer must be powered on with an active audio
session, and wake behavior depends on the operating system and hardware. Use a
separate primary alarm for anything safety-critical. Read the
[alarm guide](apps/docs/content/docs/alarms.mdx) before relying on one.

## Privacy

RadioCLI does not require an account, proxy your audio, or upload your listening
history. Favorites, recents, imports, settings, alarms, track history, and stats
stay in a local JSON library.

Nearby discovery requests an approximate location only when you open that
screen. Radio Browser favorite votes can be disabled in Settings. The full data
flow is documented in [Privacy and security](apps/docs/content/docs/privacy-security.mdx).

## Development

```bash
git clone https://github.com/Ciphore/RadioCLI.git
cd RadioCLI
npm ci
npm run verify
npm run dev
```

`npm run verify` runs the type checks, lint, tests, production build, and live
provider validation. Contributions are welcome—start with
[CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Getting started](apps/docs/content/docs/index.mdx)
- [Installation](apps/docs/content/docs/getting-started/install.mdx)
- [Controls](apps/docs/content/docs/getting-started/tui-controls.mdx)
- [CLI and agent control](apps/docs/content/docs/getting-started/cli.mdx)
- [Platforms](apps/docs/content/docs/platforms.mdx)
- [Troubleshooting](apps/docs/content/docs/troubleshooting.mdx)
- [Architecture](apps/docs/content/docs/architecture.mdx)

## License

[MIT](LICENSE)
