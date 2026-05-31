# Homebrew Packaging

RadioCLI's npm package should stay a normal Node CLI package. Native playback
belongs to the native package manager.

The Homebrew lane gives macOS users a one-command install that can pull in `mpv`
and `ffmpeg` alongside RadioCLI, so regular playback and AirPlay prerequisites
arrive together:

```bash
brew install ciphore/tap/radiocli
```

## Tap Layout

The public tap repository is `Ciphore/homebrew-tap`:

```text
homebrew-tap/
  Formula/
    radiocli.rb
```

Copy `radiocli.rb.template` to `Formula/radiocli.rb` in that tap after each npm
publish, then replace:

- `{{VERSION}}` with the npm version
- `{{SHA256}}` with the npm tarball SHA-256

## Release Flow

From the RadioCLI repo:

```bash
npm run verify:release
npm publish --access public
npm view @ciphore/radiocli@{{VERSION}} dist.tarball
curl -L "$(npm view @ciphore/radiocli@{{VERSION}} dist.tarball)" -o /tmp/radiocli-{{VERSION}}.tgz
shasum -a 256 /tmp/radiocli-{{VERSION}}.tgz
```

In the tap repo:

```bash
mkdir -p Formula
cp /path/to/RadioCLI/packaging/homebrew/radiocli.rb.template Formula/radiocli.rb
# Replace {{VERSION}} and {{SHA256}}.
brew install --build-from-source ./Formula/radiocli.rb
brew test radiocli
radiocli doctor
git add Formula/radiocli.rb
git commit -m "Add radiocli {{VERSION}}"
git push
```
