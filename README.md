# Radio Atlas

Radio Atlas is a terminal radio receiver for exploring live public radio stations around the world.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run smoke:data
npm run smoke:playback
npm run test
npm run build
```

Playback prefers `mpv` when available and falls back to `ffplay`.

CLI commands after `npm run build`:

```bash
node dist/cli.js check
node dist/cli.js countries
node dist/cli.js search "tokyo jazz"
node dist/cli.js import stations.m3u
node dist/cli.js export favorites.m3u
node dist/cli.js add-url https://example.com/live.mp3 "Example FM"
```

Inside the TUI:

- `1`-`9`: jump from the home menu.
- `:`: command palette. Try `:search lagos jazz`, `:codec MP3`, `:bitrate 128`, `:clear`, `:volume 60`, `:sleep 15`.
- Nearby station lookup is opt-in. Use Settings or `:location on`.
- Tuning times out after the configured timeout and can skip to the next station when skip-broken is enabled.
- `[` / `]`: page through long station and country lists.
- `+` / `-`: volume.
- `m`: mute.
- `s`: sleep timer on the Now Playing screen.
- `d`: stream diagnostics on the Now Playing screen.
- `:timeout 15`: set tune timeout seconds.
- `:skip off`: disable automatic skip-to-next after a failed tune.
