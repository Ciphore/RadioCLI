# Architecture

Radio Atlas is a terminal-first product built around four seams: TUI state,
provider adapters, playback control, and local persistence.

## Runtime Shape

```text
src/cli.tsx
  -> src/ui/App.tsx
      -> provider manager
      -> player controller
      -> JSON library store
      -> Ink screens/components
```

The CLI has two modes:

- Interactive TUI: `radio-atlas`
- Command mode: `radio-atlas search "tokyo jazz"`, `radio-atlas check`,
  `radio-atlas import stations.m3u`

## Provider Layer

`ProviderManager` coordinates public station sources.

- `RadioBrowserProvider` is the primary source for countries, station search,
  geo metadata, station popularity, and tune resolution.
- `RadioGardenProvider` is experimental because terminal clients can be blocked
  by edge protection.
- Playlist imports are modeled as first-class `playlist` stations.

Radio Browser calls use mirror fallback and a durable cache. If a live request
fails and stale cached data exists, the provider returns the stale data rather
than blanking the interface.

## Playback Layer

`PlayerController` owns playback process lifecycle.

- Preferred backend: `mpv`
- Fallback backend: `ffplay`
- `mpv` is controlled over JSON IPC for pause, mute, volume, readiness checks,
  and metadata polling.

The controller waits for backend readiness before reporting playback as active.
Tune attempts time out according to `settings.tuneTimeoutSeconds`.

## TUI Layer

The TUI is an Ink app with explicit screens:

- Home
- World map
- Countries
- Search
- Nearby
- Now Playing
- Recent
- Favorites/imports
- Settings

`computeTerminalLayout()` converts terminal dimensions into list sizes, receiver
width, compact mode, and map mode. Screens consume those layout values instead
of hard-coding visible rows.

## Persistence

The store is local JSON. It keeps:

- recent stations
- favorites
- imported stations
- settings

Corrupt store/cache files are renamed with a `.bad-*` suffix before defaults are
used, so user data is not silently overwritten.
