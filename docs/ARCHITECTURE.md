# Architecture

RadioCLI is a terminal-first product built around four seams: TUI state,
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

- Interactive TUI: `radiocli`
- Command mode: `radiocli search "tokyo jazz"`, `radiocli check`,
  `radiocli import stations.m3u`

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

Explore and Nearby share the same geospatial path: RadioCLI caches the full
available Radio Browser geotagged station atlas, filters out invalid coordinates,
computes haversine distance locally, and sorts by distance first. Popularity,
votes, bitrate, and last-check status only break near-identical coordinate ties,
so map exploration is not capped to globally popular stations.

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
- Now Playing
- Library
- Explore
- Search
- Countries
- Country station results
- World map
- Nearby
- Stats
- Settings

`computeTerminalLayout()` converts terminal dimensions into list sizes, receiver
width, compact mode, and map mode. Screens consume those layout values instead
of hard-coding visible rows.

Pure screen model helpers, tab definitions, filters, and text-editing helpers
live in `src/ui/app-state.ts`. The Now Playing screen owns receiver layout while
the receiver visualizer builders live under `src/ui/visualizers`, keeping the
screen component focused on composition.

Explore cursor movement is intentionally split between fine WASD nudges and
Shift+WASD jumps. Fine movement keeps the map from leaping over local station
clusters; jump movement preserves fast cross-continent travel.

Receiver animation has a single state boundary: `shouldAnimateReceiver()` allows
the shared pulse timer to advance only on the Now Playing screen while playback is
`playing` and backend-ready. The visualizer builders also guard inactive playback
states and return zero-signal frames, so UI cadence and rendered signal agree.

## Persistence

The store is local JSON. It keeps:

- recent stations
- favorites
- imported stations
- listening activity
- settings

Corrupt store/cache files are renamed with a `.bad-*` suffix before defaults are
used, so user data is not silently overwritten.

Writes use a temp-file-and-rename flow so interrupted writes are less likely to
leave partial JSON behind.
