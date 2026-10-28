# Sumi Ocean refinement

The existing `sumi-ocean` receiver takes visual cues from the moonlit harbour above
[boat.dev's footer](https://boat.dev/): a clear moon, soft halo, quiet horizon and
broken silver reflections. Its artwork is original typed TypeScript. It uses no
harbour code, boats, jetty, barrels, images, external fonts or network services.

The style ID, saved selection and indigo palette remain the same, including a
monochrome version. The sky stays steady. Reflections shimmer and refract through
RadioCLI's existing receiver clock and pause behavior.

## Local comparison

```sh
node scripts/build-boat-lake-preview.mjs
python3 -m http.server 4178 --bind 127.0.0.1 --directory output/boat-lake
```

Open <http://127.0.0.1:4178/ocean.html>. The **Previous receiver** button shows the
four-sample renderer immediately before this refinement. Compare sizes from
120×30 down to 20×3, in indigo or monochrome. The normal receiver maximum is 14
rows; 30 rows are an enlarged study. The preview now defaults to actual TUI
proportions with 8×16 pixel cells. **Enlarge** magnifies those same cells.

[Size checks](http://127.0.0.1:4178/ocean-sizes.html) show several sizes together,
including real Unicode text in browser monospace. Terminal font metrics can
differ from the canvas representation. The preview pauses in hidden tabs and
starts still when reduced motion is requested. An optional local footer screenshot
appears when `output/boat-lake/footer-reference.png` is present. No asset is fetched
from the original website.

## Small receivers and detail

- Use eight samples per cell on a 2×4 square-subpixel grid, matching the terminal's
  1:2 cell aspect. The sky uses Boat Lake's fine cell encoder and ordered shading.
- Keep the previous receiver's broad quadrant marks for water. Average the fine
  samples into quadrants instead of fitting diagonal shapes to the reflection.
- Adapt the horizon, moon size and number of wave bands to the viewport. Short
  receivers avoid undersampling a fixed thirty-band water field.
- Below nine rows, draw a round native circle glyph so the moon stays legible.
- Restore the previous receiver's wide, ripple-broken reflection. Its center
  meanders gently, its path widens toward the foreground, and travelling water
  texture determines which fragments catch the moonlight.

## Caching and animation

Cache the sky field, encoded sky rows and depth coordinates by viewport. Animate
water across its full width with the previous receiver's travelling noise and
perspective-dependent speed. Reflection and water share the same moving texture,
so their motion stays connected. Do not freeze the sea outside the reflection
band: that optimization removed the lateral motion that made the previous scene
work.

The cache retains at most four viewports and no playback history. Water fields
and returned segments are newly created, so consumer mutations cannot damage
cached data. The renderer adds no dependency, timer or GPU requirement.

## Local measurements

```sh
npx tsx scripts/boat-lake/benchmark-ocean.mts
```

The immediately preceding renderer is frozen in
`scripts/boat-lake/sumi-quadrants.mjs`. Each renderer receives 60 warm-up frames
and 200 measured frames at matching dimensions. Measurements report scene setup,
median and p95 CPU time, and average color-run counts. They exclude browser
painting, Ink rendering and terminal I/O.

Node v24.15.0 on this machine measured a 0.114 ms median and 0.145 ms p95
for the current 100×14 renderer, versus 0.068 ms and 0.100 ms for the previous
four-sample version. At 36×4, the current median was 0.015 ms versus 0.007 ms.
Restoring full-surface motion does more work than animating only a narrow strip;
these local CPU measurements exclude painting and terminal I/O.

Tests cover terminal column widths, glyphs, continuous backgrounds, merged runs,
a visible moon and reflected light throughout long playback at small sizes,
water texture moving on both sides of the reflection, steady sky, monochrome,
cache eviction, and mutation isolation. Water uses broad quadrant marks without
forced bars or diagonal reflection shapes. The terminal snapshot is updated.
