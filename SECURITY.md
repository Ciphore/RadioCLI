# Security

RadioCLI does not require secrets or accounts.

## Reporting

Open a private security advisory on GitHub:

```text
https://github.com/Ciphore/RadioCLI/security/advisories
```

If private reporting is unavailable, open a minimal public issue asking for a
private disclosure path, but do not include exploit details. Please avoid filing
public issues for vulnerabilities that could expose local files, private network
information, or unexpected command execution.

## Privacy Notes

- Nearby location is enabled by default for new libraries, but no location
  request is made until the Nearby screen is opened.
- Location lookup uses approximate IP-based location from `ipapi.co`; disable it
  with `l`, Settings, or `:location off`.
- The app stores recents, favorites, settings, imports, and provider cache data
  locally under the user data directory.
- RadioCLI does not proxy audio. It resolves public stream URLs and hands
  playback to native players.
- Favoriting a Radio Browser station sends a best-effort vote to that public
  directory by default; the Settings screen can disable vote sharing.

## Stream Certificate Verification

RadioCLI enables mpv TLS verification, including redirected and nested streams,
and enables TLS verification for direct FFmpeg/ffplay network media. Native
trust stores and player certificate configuration apply. It never retries an
HTTPS input with certificate verification disabled.

FFmpeg releases in circulation do not propagate TLS policy to every resource
opened by network playlist demuxers. Those inputs are restricted in FFmpeg
fallbacks: use mpv for HLS/DASH/IMF playback, or a direct audio stream for AirPlay.
Local FFmpeg inputs cannot open network protocols. The plain HTTP compatibility
retry explicitly blocks both HTTPS and TLS, including changed redirects.

Known upstream limitation: tested FFmpeg/OpenSSL builds can accept a trusted
certificate with a mismatched **numeric IP address**, even with verification
enabled. This also affects mpv builds using that native TLS implementation.
DNS hostname mismatch fixtures are rejected. Prefer DNS station URLs. A
separate Node preflight would not secure the player's actual connection, so
RadioCLI does not present one as a fix. See the
[reliability reference](apps/docs/content/docs/reliability.mdx#playback-recovery-and-secure-streams)
and native smoke results for the precise guarantees and remaining limits.

## Supported Versions

Until a tagged release cadence is established, security fixes target the active
development branch and the latest public npm release.
