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

- Nearby station discovery is opt-in.
- Location lookup uses approximate IP-based location from `ipapi.co` when
  enabled.
- The app stores recents, favorites, settings, imports, and provider cache data
  locally under the user data directory.
- RadioCLI does not proxy audio. It resolves public stream URLs and hands
  playback to `mpv` or `ffplay`.

## Supported Versions

Until a tagged release cadence is established, security fixes target the active
development branch and the latest public npm release.
