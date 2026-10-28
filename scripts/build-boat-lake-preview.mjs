/** Rebuild the offline scene comparison; never fetches assets or publishes. */
import {createRequire} from 'node:module';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const requireDocs = createRequire(new URL('../apps/docs/package.json', import.meta.url));
const {build} = requireDocs('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../output/boat-lake/', import.meta.url);
await mkdir(output, {recursive: true});
await build({
  stdin: {contents: "export {buildBoatLake} from './src/ui/visualizers/boat-lake.js';", resolveDir: root, loader: 'ts'},
  outfile: fileURLToPath(new URL('receiver.js', output)),
  bundle: true, format: 'esm', target: 'es2022', minify: true,
});
await build({
  stdin: {contents: "export {buildSumiOcean} from './src/ui/visualizers/sumi-ocean.js';", resolveDir: root, loader: 'ts'},
  outfile: fileURLToPath(new URL('ocean.js', output)),
  bundle: true, format: 'esm', target: 'es2022', minify: true,
});
await copyFile(new URL('boat-lake/sumi-quadrants.mjs', import.meta.url), new URL('sumi-quadrants.js', output));
await copyFile(new URL('boat-lake/ocean-sizes.html', import.meta.url), new URL('ocean-sizes.html', output));
await copyFile(new URL('boat-lake/ocean-preview.html', import.meta.url), new URL('ocean.html', output));
await copyFile(new URL('boat-lake/reference.mjs', import.meta.url), new URL('reference.js', output));
await copyFile(new URL('boat-lake/terminal-canvas.mjs', import.meta.url), new URL('terminal-canvas.js', output));
await copyFile(new URL('boat-lake/sizes.html', import.meta.url), new URL('sizes.html', output));
await copyFile(new URL('boat-lake/preview.html', import.meta.url), new URL('index.html', output));
// Local browsers may retain imported modules while an HTML tab is refreshed.
// Give each renderer build a content version so comparison tabs stay current.
const oceanVersion = createHash('sha256').update(await readFile(new URL('ocean.js', output))).digest('hex').slice(0, 12);
for (const page of ['ocean.html', 'ocean-sizes.html']) {
  const url = new URL(page, output);
  const source = await readFile(url, 'utf8');
  await writeFile(url, source.replaceAll("'./ocean.js'", `'./ocean.js?v=${oceanVersion}'`));
}
console.log('Local previews: output/boat-lake/index.html and output/boat-lake/ocean.html');
