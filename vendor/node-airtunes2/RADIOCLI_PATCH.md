# RadioCLI AirPlay sender source

Based on the published `node-airtunes2@2.5.0` archive:
https://registry.npmjs.org/node-airtunes2/-/node-airtunes2-2.5.0.tgz

Archive SHA-256: `2cee1d86fcd2e5fb4f56f12e23fd1abbdbd0b71a9bc5e1ffe1dcbb885cec1d71`.
The original archive's npm integrity and hashes of unchanged published files are
recorded in `UPSTREAM.json`. Original attribution and AGPLv3 license are retained.

RadioCLI modifications, 2026-10-16:

- `lib/atvAuthenticator.js` uses `lib/ed25519.js` and Node's native Ed25519
  instead of elliptic. Its synchronous hex API, public key bytes, signature
  casing, AES-GCM confirmation, and AES-CTR verification formats are preserved.
- `package.json` identifies this local revision as `2.5.0-radiocli.1`, records
  the replacement, and lists only the sender's runtime imports. Unused packaging,
  Cast, discovery, HTTP, and build-tool dependencies are removed. RadioCLI owns
  the corresponding optional dependencies and the optional native build tool.
- Upstream host-specific `build/` output is omitted. All native C/C++ source
  remains available. RadioCLI's optional postinstall builds the Linux codec when
  node-gyp and build prerequisites are available, preserving the upstream JS
  fallback if unavailable. macOS uses the upstream JS codec. Portable installs
  skip the build and remain usable for normal local playback.

The other upstream source files are unchanged. RadioCLI's existing bounded RTSP,
legacy Digest, volume and metadata compatibility patches still apply at runtime.
The modified source, native build source, license and this notice ship in the npm
package; no external unpublished fork is required. Regression fixtures include
RFC 8032 and deterministic outputs captured from the original published sender.
