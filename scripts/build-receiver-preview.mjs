/** Bundle the actual CLI renderers for the website without changing their Node ESM imports. */
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const requireDocs = createRequire(new URL('../apps/docs/package.json', import.meta.url));
const {build} = requireDocs('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../apps/docs/.generated/', import.meta.url);
const exports = [
  "export {buildVisualizer} from './src/ui/visualizers/receiver-visualizers.js';",
  "export {receiverStyleNames, themeNames} from './src/types.js';",
  "export {themeAccent} from './src/ui/theme.js';",
];
await mkdir(output, {recursive: true});
await build({
  stdin: {contents: exports.join('\n'), resolveDir: root, loader: 'ts'},
  outfile: fileURLToPath(new URL('receiver-engine.js', output)),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  inject: [fileURLToPath(new URL('../apps/docs/lib/receiver-buffer.ts', import.meta.url))],
  minify: true,
});
await writeFile(new URL('receiver-engine.d.ts', output),
  exports.join('\n').replaceAll("'./src/", "'../../../src/") + '\n');

// Audit visible foreground/background colors against the actual renderer.
// Exclude mono: original-color scenes intentionally have a monochrome mode.
const engine = await import(new URL('receiver-engine.js', output));
const colorThemes = engine.themeNames.filter(theme => theme !== 'mono');
const colorBehavior = {};
function visibleColors(lines) {
  const colors = [];
  for (const row of lines) for (const segment of row.segments ?? [row]) {
    for (const glyph of segment.text) {
      if (segment.backgroundColor) colors.push(segment.backgroundColor);
      if (glyph.trim() && glyph !== '\u2800') colors.push(segment.color);
    }
  }
  return colors;
}
for (const style of engine.receiverStyleNames) {
  let original = false;
  let themed = false;
  for (const pulse of [0, 10, 20, 40, 60, 80, 100, 124]) {
    const frames = colorThemes.map(theme => visibleColors(engine.buildVisualizer(
      style, pulse, 120, 30, null, {state: 'playing', ready: true}, theme
    )));
    for (let index = 0; index < frames[0].length; index++) {
      const colors = new Set(frames.map(frame => frame[index]));
      if (colors.size === 1) original = true;
      else themed = true;
    }
  }
  colorBehavior[style] = !themed ? 'original' : original ? 'mixed' : 'themed';
}
await writeFile(new URL('receiver-colors.ts', output),
  `// Generated from the terminal renderers.\nexport const receiverColorBehavior = ${JSON.stringify(colorBehavior, null, 2)} as const;\n`);
