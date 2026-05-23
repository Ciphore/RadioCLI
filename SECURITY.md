# Security

Radio Atlas does not require secrets or accounts.

## Reporting

Open a private security advisory on GitHub if available, or contact the
maintainer through the repository profile. Please avoid filing public issues for
vulnerabilities that could expose local files, private network information, or
unexpected command execution.

## Privacy Notes

- Nearby station discovery is opt-in.
- Location lookup uses approximate IP-based location when enabled.
- The app stores recents, favorites, settings, imports, and provider cache data
  locally under the user data directory.
- Radio Atlas does not proxy audio. It resolves public stream URLs and hands
  playback to `mpv` or `ffplay`.

## Supported Versions

The current `master` branch receives security fixes until the first tagged
release cadence is established.
