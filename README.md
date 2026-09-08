![RadioCLI Now Playing visualizer demo](apps/docs/public/demo/radiocli-now-playing.gif)

# RadioCLI

[![CI](https://github.com/Ciphore/RadioCLI/actions/workflows/ci.yml/badge.svg)](https://github.com/Ciphore/RadioCLI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

RadioCLI brings live radio to your terminal. Browse stations around the world,
save favorites, and listen through `mpv`—without an account or cloud library.

Built with [Ink](https://github.com/vadimdemedes/ink),
[React](https://react.dev/), and the
[Radio Browser](https://api.radio-browser.info/) directory.

## Highlights

- Discover stations through Explore, Search, Countries, or approximate-location Nearby.
- Listen with a receiver-style Now Playing screen, live metadata, sleep timer, diagnostics, and selectable visualizers.
- Keep favorites, recents, imports, track history, and listening stats on your machine.
- Create one-time or recurring radio alarms from the TUI, with native background
  scheduling, station fallback, missed-run grace, snooze, and optional Alarm Guard.
- Move through the exact station list you tuned from with previous and next controls.
- Use `mpv` for complete playback control, with `ffplay` and VLC as limited fallbacks.
- Resize freely: full, compact, and micro layouts preserve navigation and essential controls; Explore retains its interactive world map at every usable size.

## Quick start

On macOS configurations supported by Homebrew:

```bash
brew install ciphore/tap/radiocli
radiocli
```

macOS, Linux, or Windows with npm:

```bash
npm install -g @ciphore/radiocli
radiocli setup
radiocli
```

RadioCLI requires Node.js 22 or newer. The Homebrew formula installs `mpv` and
FFmpeg. After an npm install, `radiocli setup` detects the operating system and
package manager, lets you choose `mpv`, FFmpeg, and VLC, installs the selected
native tools with branded progress feedback, and checks that executables are
available. Play a station to verify the actual audio path. Intel or older macOS
installations should consult the platform matrix for alternative package routes.

See the [installation guide](apps/docs/content/docs/getting-started/install.mdx)
for Windows, Linux distributions, AirPlay prerequisites, and fallback players.

## Platform coverage

RadioCLI separates core playback, storage, terminal rendering, desktop helpers,
and native alarm services. A missing scheduler or clipboard helper leaves the
other features available. `radiocli doctor --json` reports each capability,
terminal and network policy, and runtime eligibility separately.

The [platform matrix](apps/docs/content/docs/platforms.mdx) distinguishes required
CI targets from verified installations, experimental community paths, and known
runtime blockers. Node 22 and 24 are the reference test lines. BSD package plans,
Termux, Haiku and illumos guidance do not imply that every OS/CPU combination has
been exercised. AIX playback and Haiku's packaged Node 20 remain explicit gaps.
Linux without a usable systemd user session can still run the player and TUI;
reliable background alarms require a verified native adapter.

Invocation preferences do not change saved settings:

```bash
RADIOCLI_ASCII=1 radiocli             # ASCII decoration; station names preserved
NO_COLOR=1 radiocli                  # no color or background fills
RADIOCLI_SCREEN_READER=1 radiocli     # readable controls; no visualizer animation
RADIOCLI_OFFLINE=1 radiocli           # cached directories and saved stations
RADIOCLI_LOW_BANDWIDTH=1 radiocli     # cached atlas; no automatic receiver scan
```

Offline mode disables directory, location, update, vote and receiver-discovery
requests. An external player still needs a connection to listen to a live stream.
For proxy, SSH, read-only storage and custom-player paths, see
[troubleshooting](apps/docs/content/docs/troubleshooting.mdx).

## Visual tour

These recordings come from the built TUI. Generate them locally with
`npm run demo:assets`.

### Library

![Favorites and recent stations in the RadioCLI Library](apps/docs/public/demo/radiocli-library.gif)

### Explore

![World map discovery in RadioCLI Explore](apps/docs/public/demo/radiocli-explore-map.gif)

### Search

![Station search results in RadioCLI](apps/docs/public/demo/radiocli-search.gif)

### Nearby

![Nearby stations in RadioCLI](apps/docs/public/demo/radiocli-nearby.gif)

### Stats

![Local listening stats with selectable display colors](apps/docs/public/demo/radiocli-stats-colors.gif)

## Essential controls

| Key | Action |
| --- | --- |
| `←` / `→` or `Tab` / `Shift+Tab` | Switch screens |
| `↑` / `↓` or `n` / `p` | Move the selection |
| `Enter` | Open or tune the selection |
| `space` or `F8` | Pause or resume with `mpv` |
| `,` / `.` or `F7` / `F9` | Previous or next station |
| `+` / `-` | Change volume |
| `f` | Save or remove a favorite |
| `?` | Open all shortcuts and commands |
| `q` or `Ctrl+C` twice | Quit cleanly |

The footer always shows controls for the current screen. Press `:` to open the
command palette. The [TUI controls guide](apps/docs/content/docs/getting-started/tui-controls.mdx)
covers filters, playback, media-key learning, AirPlay, and every command.

## CLI

RadioCLI can also be controlled by local coding agents. Run `radiocli setup`
and opt into MCP, or use `radiocli setup --mcp`, to configure detected Codex,
Claude, OpenCode, Cursor, Gemini, VS Code/Copilot, and Orca-backed runtimes
automatically. From the TUI, open **Settings → Agent control & MCP** and turn on
**Allow local agent control** for the same one-step setup—no terminal command is
required. The same actions are
available to non-MCP harnesses through `radiocli agent` and `radiocli alarm`:
search and play stations, browse recents/favorites/nearby stations, favorite the
current station, inspect listening stats, create and control alarms, control
macOS AirPlay, change the receiver look, or run a user-configured completion
preset. Codex Voice can invoke those same typed MCP tools. Agent playback opens
the normal RadioCLI TUI in a terminal window by default on macOS, Windows, and
Linux. Interactive setup explains that macOS may require the agent host to approve
a one-time Automation prompt; users can explicitly opt into headless playback.
Scheduled alarms remain isolated and always use local output rather than
unattended AirPlay. See the
[CLI guide](apps/docs/content/docs/getting-started/cli.mdx#local-agent-and-mcp-control).

```bash
radiocli                 # Start the TUI
radiocli check           # Check providers, playback tools, and the local store
radiocli doctor --json   # Create a redacted support report
radiocli search "japan hits"
radiocli countries
radiocli import stations.m3u
radiocli export favorites.m3u
radiocli add-url <stream-url> [station name]
radiocli alarm list
radiocli alarm doctor
radiocli update --install # Upgrade and repair enabled MCP registrations
```

Existing installations keep their library and preferences when upgraded. Use
`radiocli update` to inspect the detected Homebrew, npm, pnpm, or Bun command,
or `radiocli update --install` to run it. MCP registrations use an
upgrade-stable launcher so versioned package paths do not break them. On
Windows this is a shell-free Node command; on Unix it uses the `radiocli` shim.
Run `radiocli mcp status` to inspect registrations and `radiocli mcp repair`
after moving an installation or when an agent client reports a stale server;
fully quit and reopen agent clients after enabling, repairing, or upgrading.
Until that restart, even a newly created task in an already-running client will
not have RadioCLI's tools and may incorrectly fall back to browser playback.

RadioCLI imports `.m3u`, `.pls`, and `.xspf` playlists. It exports favorites
and imported streams as `.m3u`.

Alarms are experimental beta functionality and live under **Overview**,
immediately before Settings. Saving an enabled
alarm registers it with launchd on macOS, a systemd user timer on Linux, or Task
Scheduler on Windows, so the terminal does not need to remain open. When it
fires, RadioCLI reopens the saved supported terminal and shows the ringing
screen. Enter transfers the station into normal interactive playback; Space
stops it and snoozes for 10 minutes. If a
RadioCLI TUI is already open, that instance shows the controls instead. The
computer must still be powered on with a logged-in interactive audio session; wake timing
depends on hardware and OS power policy. See the [CLI guide](apps/docs/content/docs/getting-started/cli.mdx)
and [reliability notes](apps/docs/content/docs/reliability.mdx) before relying on
an alarm for something critical. Use a secondary device as the primary alarm
for safety-critical, medical, travel, or emergency timing. See the dedicated
[Alarms guide](apps/docs/content/docs/alarms.mdx) for the full workflow.

The **Verify alarm setup** row performs a disposable native-scheduler
registration, an authenticated terminal/control handshake, sleep-inhibitor and
system-volume checks, and a short sample from the next configured alarm. It
cleans up the temporary job and reports hard blockers separately from hardware-
or policy-dependent wake limitations.

See the [CLI guide](apps/docs/content/docs/getting-started/cli.mdx) for all
arguments and examples.

## Playback and reliability

RadioCLI prefers `mpv` because it handles redirects, HLS, real-world codecs,
ICY metadata, and interactive controls reliably. `ffplay` and VLC can keep a
stream playing when `mpv` is unavailable, but the UI labels their controls as
limited.

Station providers use mirror fallback, bounded caches, and stale-cache recovery.
Playback waits for backend readiness, applies tune timeouts, and can skip broken
streams. Corrupt library and cache files are backed up instead of silently
overwritten.

Scheduled playback retries the primary station once, then tries an optional
fallback. A missed-run grace window controls catch-up after sleep or logout.
True fade-in requires `mpv`; `ffplay` and VLC start audibly at the configured
target volume. Scheduled alarms always use local speakers, never unattended
AirPlay.

On macOS, an npm or source installation is executed by Node, so System Settings
may identify its background item as `node`. Showing RadioCLI as the providing
application requires a future signed macOS app bundle with a bundled helper;
changing a launchd label cannot safely relabel the executable.

Read the [reliability notes](apps/docs/content/docs/reliability.mdx) for failure
handling and troubleshooting.

## Privacy

RadioCLI does not require an account, proxy audio, or upload your listening
history. Favorites, recents, imports, settings, alarms, track history, and
activity stay in a local JSON library. Full JSON library backups include alarm
definitions, while native scheduler registrations, runtime health, Alarm Guard
state, and authenticated loopback-control tokens remain machine-local.

Nearby contacts `ipapi.co` only when you open that screen, then uses an
approximate location to sort the local station atlas. Disable the lookup with
`l`, Settings, or `:location off`.

Favoriting a Radio Browser station sends a best-effort public directory vote by
default. Turn off **Share favorite votes with Radio Browser** in Settings to
keep favorites local-only.

See [Privacy and security](apps/docs/content/docs/privacy-security.mdx) for the
complete data-flow description.

## Project structure

- `src/ui` — screens, input, layout, and terminal rendering
- `src/providers` — station directories, resolution, and caches
- `src/player` — playback backends, metadata, and AirPlay
- `src/platform` — host identity, independent capabilities, native command plans,
  paths, terminal policy, networking and runtime eligibility
- `src/alarms` — schedules, native registration, Alarm Guard, and active controls
- `src/storage` — local library persistence and migration
- `apps/docs` — documentation website and manual

More detail lives in the [architecture guide](apps/docs/content/docs/architecture.mdx)
and [design notes](apps/docs/content/docs/design.mdx).

## Development

```bash
git clone https://github.com/Ciphore/RadioCLI.git
cd RadioCLI
npm ci
npm run verify
npm run dev
```

`npm run verify` checks types, lint, tests, the production build, and live provider
data. `npm run fresh:check -- --require-mpv` tests packed installs with and without
optional dependencies using a local WAV, real mpv IPC controls and MCP. See
[contribution checks](CONTRIBUTING.md) for documentation and packaging validation.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and
include `radiocli check` output with playback reports.

## Documentation

- [Getting started](apps/docs/content/docs/index.mdx)
- [Installation](apps/docs/content/docs/getting-started/install.mdx)
- [Platform matrix](apps/docs/content/docs/platforms.mdx)
- [Troubleshooting](apps/docs/content/docs/troubleshooting.mdx)
- [Controls](apps/docs/content/docs/getting-started/tui-controls.mdx)
- [Architecture](apps/docs/content/docs/architecture.mdx)
- [Roadmap](apps/docs/content/docs/roadmap.mdx)
- [Release packaging](apps/docs/content/docs/release-packaging.mdx)

Run the documentation site locally with `npm run docs:dev`.

## License

[MIT](LICENSE)
