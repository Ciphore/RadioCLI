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
