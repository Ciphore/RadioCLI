# Boat Lake receiver

`boat-lake` is a local adaptation of the procedural lake behind [boat.dev](https://boat.dev/).
The original scene was extracted on October 28, 2026 from the public client bundle
[`26-7j4wbk3v76.js`](https://boat.dev/_next/static/chunks/26-7j4wbk3v76.js).
The landscape, lighting, water, reflections and sail polygons come from that
scene. Provenance comments are retained in the isolated kernel and local
reference. No website copy, branding, fonts, analytics or network code is included.

## Preview locally

```sh
node scripts/build-boat-lake-preview.mjs
python3 -m http.server 4178 --bind 127.0.0.1 --directory output/boat-lake
```

Open <http://127.0.0.1:4178>. Switch between **Extracted scene** and **Receiver style**.
The reference runs the original layered drawing and character quantizer. The
receiver runs the terminal adapter. The preview defaults to actual TUI proportions
with 8×16 pixel cells. **Enlarge** magnifies those cells without inventing detail.
Sizes range from 120×30 to 20×3, including the normal 120×18 receiver maximum.
[Size checks](http://127.0.0.1:4178/sizes.html) show several sizes together, plus
real Unicode text rendered in browser monospace for the smaller layouts.
Terminal font metrics can differ from the canvas representation.

Pause/play is available; the preview also pauses in hidden tabs and starts still
when reduced motion is requested. Both reference and receiver use fixed daytime
lighting (phase `0.44`) with no page fade. The builder uses installed esbuild and
bundled local sources. It does not fetch assets. Output is ignored by Git.

Select **Boat Lake** in RadioCLI's existing receiver-style picker. The docs
receiver gallery uses the same registry and renderer. The radio default and saved
receiver selection are unchanged.

## Composition and rendering

- Size the scene to the viewport rather than squeezing a fixed 160×42 artboard
  into every receiver. Short layouts use a lower horizon, with fewer, larger boats.
- Keep the foreground boat away from the bright sun reflection for contrast.
- Rasterize the original sail and hull polygons directly; sampling already
  quantized sprites a second time erased their small features.
- Preserve eight samples per cell, with quadrant blocks, diagonal triangles,
  quarter-height blocks and fine ordered shading. Evaluate two-color cluster
  errors from their sums rather than repeatedly calculating every residual.
- At 3–6 rows, use explicit terminal-grid sails, hull and pine silhouettes so they
  remain recognizable. The smallest receivers use one boat.
- Adapt the upstream pine minimum height so short scenes retain their tips.
- Cache static scenery, encoded static cells and a detailed reflection field.
  Interpolated horizontal refraction animates the cached water; larger boats bob
  gently. This is an approximation of the original water animation, rather than
  rerunning its full reflected scene on every frame.
- Retain at most four viewport caches with no playback history. Preserve the
  original blue palette, with grayscale for the mono theme, and merge adjacent
  equal-color cells into terminal runs.

The receiver needs no GPU, images, external fonts or network service. Motion uses
RadioCLI's existing receiver clock and pause behavior.

## Measurements

```sh
npx tsx scripts/boat-lake/benchmark.mts
```

The benchmark warms both renderers for 60 frames, then measures 200 frames per
output resolution. The reference measures original field sampling and original
character quantization on its fixed artboard. The receiver additionally includes
boat compositing and segment creation, and uses its adaptive composition and
cached refraction animation. This compares their steady-state costs, not identical
per-frame algorithms. A first frame or cache miss also builds the reflected field.
Neither measurement includes browser painting, Ink rendering or terminal I/O.

Node v24.15.0 on this machine:

| Viewport | Reference median | Receiver median | Receiver p95 |
| --- | ---: | ---: | ---: |
| 120×30 | 9.258 ms | 0.869 ms | 1.115 ms |
| 120×18 | 5.952 ms | 0.522 ms | 0.751 ms |
| 100×14 | 3.547 ms | 0.360 ms | 0.445 ms |
| 80×10 | 2.041 ms | 0.225 ms | 0.318 ms |
| 60×7 | 1.135 ms | 0.142 ms | 0.209 ms |
| 36×4 | 0.374 ms | 0.061 ms | 0.092 ms |
| 24×4 | 0.246 ms | 0.026 ms | 0.027 ms |
| 20×3 | 0.148 ms | 0.016 ms | 0.017 ms |

Tests cover terminal column widths, glyphs and palettes, merged segments,
monochrome, steady scenery with animated water, detailed shading, recognizable
compact sails/hulls/pines throughout playback, and determinism after cache eviction.
