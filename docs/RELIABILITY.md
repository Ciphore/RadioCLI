# Reliability

Internet radio fails in ordinary, boring ways. RadioCLI treats that as a
product requirement.

## Failure Modes

- directory APIs can be down or rate limited
- station metadata can be stale
- resolved stream URLs can redirect or expire
- stations can hang without returning an error
- station codecs can be mislabeled
- ICY metadata can be absent, malformed, or delayed
- terminal dimensions can change mid-session

## Current Defenses

- Radio Browser mirror fallback
- durable provider cache with stale fallback
- cached geotagged station atlas for Explore and Nearby, with local
  distance-first ranking
- bounded network calls for provider and location lookups
- tune timeout
- skip-to-next on failed tune when enabled
- `mpv` IPC readiness check
- playback-gated receiver animation and zero-signal visualizer frames for
  inactive playback states
- metadata polling through `mpv`, avoiding a second stream listener
- opt-in location lookup
- corrupt store/cache backups
- atomic local JSON writes
- defensive playlist import
- compact layout warning for tiny terminals

## Known Limits

- Some stations play silence while still looking technically connected.
- Radio Garden can be blocked by edge protection.
- Station health is local and opportunistic; there is not yet a long-term health
  score per station.
- The country-density map is symbolic. Explore uses a Natural Earth braille map
  with a movable scan cursor and true distance ranking, but it can only place
  stations that providers expose with valid coordinates.

## Next Reliability Work

- per-station health cache
- explicit failed-stream reasons in station lists
- "never show again" station hiding
- retry/backoff by station/provider
- optional stream HEAD/probe before tune
