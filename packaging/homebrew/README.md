# Homebrew Packaging

RadioCLI's npm package should stay a normal Node CLI package. Native playback
belongs to the native package manager.

The Homebrew lane gives macOS users a one-command install that can pull in `mpv`
alongside RadioCLI:

```bash
brew install ciphore/tap/radiocli
```

## Tap Layout

Create a separate public tap repository:

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
npm view radiocli@{{VERSION}} dist.tarball
curl -L "$(npm view radiocli@{{VERSION}} dist.tarball)" -o /tmp/radiocli-{{VERSION}}.tgz
shasum -a 256 /tmp/radiocli-{{VERSION}}.tgz
```

In the tap repo:

```bash
mkdir -p Formula
cp /path/to/RadioCLI/packaging/homebrew/radiocli.rb.template Formula/radiocli.rb
# Replace {{VERSION}} and {{SHA256}}.
brew install --build-from-source ./Formula/radiocli.rb
brew test radiocli
git add Formula/radiocli.rb
git commit -m "Add radiocli {{VERSION}}"
git push
```

