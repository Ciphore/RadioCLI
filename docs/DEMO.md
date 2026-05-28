# Demo

The best demo is a short terminal recording that shows the product loop:

1. Start `radiocli`.
2. Open Countries and press `w` for the world map.
3. Search for `tokyo jazz`.
4. Tune a station.
5. Open diagnostics.
6. Show the command palette.
7. Quit cleanly.

Generate a scripted transcript:

```bash
npm run demo:script
```

Record an interactive demo with asciinema, if installed:

```bash
asciinema rec assets/demo.cast --command "radiocli"
```

Convert the cast to a GIF with `agg`, if installed:

```bash
agg assets/demo.cast assets/demo.gif
```

The repository intentionally does not commit generated demo media until there is
a recording worth showing on the README.
