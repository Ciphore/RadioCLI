# Release Packaging

RadioCLI uses two distribution lanes:

- npm for the Node CLI package
- Homebrew for the native one-command macOS install path

NPM installs RadioCLI and JavaScript dependencies only. It should not install
system packages from lifecycle scripts. Native playback comes from `mpv`, with
`ffplay` from FFmpeg as an optional fallback.

## NPM Release

Before publishing:

```bash
npm ci
npm run verify:release
npm pack --dry-run
```

Test the packed tarball locally:

```bash
npm pack
npm install -g ./radiocli-0.1.0.tgz
radiocli --help
radiocli doctor
radiocli check
```

Publish:

```bash
npm login
npm publish --access public
```

After publishing, `npm install -g radiocli` should install the executable and
all JavaScript dependencies. Users should run `radiocli doctor` if playback is
not ready.

## Homebrew Tap

The formula template lives in `packaging/homebrew/radiocli.rb.template`.

After each npm publish:

```bash
npm view radiocli@0.1.0 dist.tarball
curl -L "$(npm view radiocli@0.1.0 dist.tarball)" -o /tmp/radiocli-0.1.0.tgz
shasum -a 256 /tmp/radiocli-0.1.0.tgz
```

Copy the template into a separate `homebrew-tap` repository:

```text
homebrew-tap/
  Formula/
    radiocli.rb
```

Replace `{{VERSION}}` and `{{SHA256}}`, then verify:

```bash
brew install --build-from-source ./Formula/radiocli.rb
brew test radiocli
```

Once the tap is published, macOS users can install RadioCLI and native playback
dependencies with:

```bash
brew install ciphore/tap/radiocli
```

