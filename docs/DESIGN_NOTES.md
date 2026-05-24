# Design Notes

Radio Atlas is meant to feel like a product, not a terminal proof of concept.

## Why Ink

Ink gives the project React's component model while staying native to terminal
constraints. That makes it easier to keep the app screen-oriented, testable, and
incrementally adaptable as the UI grows.

## Why mpv

Radio streams are messy: redirects, playlists, HLS, odd codecs, and flaky
metadata are normal. `mpv` already handles that complexity well and exposes JSON
IPC for controls and metadata.

`ffplay` remains as a fallback because it is often already installed with
FFmpeg, but `mpv` is the intended backend.

## Why Provider Adapters

Public radio directories change, block, rate limit, and disagree. Keeping
providers behind adapters prevents the UI from depending on one API shape.

Radio Browser is primary because it is public and has broad station metadata.
Radio Garden stays experimental because its public web experience does not mean
its API is stable for terminal clients.

## Why Location Is Opt-In

Nearby stations are useful, but IP-based location lookup is privacy-sensitive.
Radio Atlas requires explicit opt-in through Settings or `:location on`.

## TUI Aesthetic

The UI borrows from old receiver and car head-unit displays: direct labels,
compact hierarchy, visible status, and no fake copy. The app should be usable in
a terminal session, not a landing page rendered in ANSI.

The app shell paints its own near-black background instead of relying on the
terminal profile color. That keeps the receiver, tabs, stats panels, and footer
visually cohesive across different terminal themes.

The Now Playing screen supports multiple visualizer styles so the display can
feel like a receiver without locking the whole product into one animation. The
default SDR style borrows from retro spectrum-analyzer tools: dB labels,
frequency ticks, sampling-rate readouts, and a steady CRT-ish cadence around 10
frames per second. Alternate styles include spectrum bars, oscilloscope traces,
signal meters, retro tuner displays, waterfall views, physical-media callbacks,
ambient matrix/hologram displays, and a spinning ASCII cube inspired by terminal
3D demos.

## Tokscale-Inspired Navigation And Stats

The horizontal tab rail is intentionally dense: it keeps the app feeling like a
terminal tool with real surfaces instead of a stack of disconnected menus. On
wide terminals the full rail is visible; on narrower terminals it keeps the
active tab and nearby tabs in view so navigation does not wrap.

Listening stats use the same direct, boxed language as the rest of the app. The
contribution graph shows the last 371 days of local listening activity, while
the numeric stats report real locally persisted sessions: favorite station,
session count, current streak, active days, total hours listened, favorite time,
and longest streak.

The stats graph palette follows the selected display color, including the
legend. A blue theme should produce blue contribution levels, amber should
produce amber levels, and so on, so Stats feels like part of the same configured
receiver surface.
