// Run with: node --expose-gc --import tsx scripts/receiver-memory-smoke.mjs
// Use one persistent real Ink root and discard output. Testing-library's
// frames[] would itself retain the history and invalidate memory measurements.
import assert from 'node:assert/strict';
import {PassThrough, Writable} from 'node:stream';
import {setImmediate as settle} from 'node:timers/promises';

// Match the CLI's pre-import default. Explicit NODE_ENV values are preserved.
process.env.NODE_ENV ??= 'production';
const [
  {default: React}, {Box, render}, {receiverStyleNames},
  {DisplayContext, resolveDisplayMode}, {configureTerminalRenderer},
  {ReceiverVisualRow}, {buildVisualizer}
] = await Promise.all([
  import('react'), import('ink'), import('../src/types.js'),
  import('../src/ui/display-context.js'), import('../src/ui/terminal-renderer.js'),
  import('../src/ui/components/ReceiverVisualRow.js'), import('../src/ui/visualizers/receiver-visualizers.js')
]);
assert.equal(typeof global.gc, 'function', 'Run Node with --expose-gc');
const frames = Number(process.argv.find(value => value.startsWith('--frames='))?.split('=')[1] ?? 2000);
assert(Number.isInteger(frames) && frames >= 1000, '--frames must be an integer >= 1000');
const playback = {state: 'playing', ready: true, backend: 'mpv', volume: 70, muted: false};
const scenes = ['manhattan', 'skyline', 'golden-gate', 'alpine', 'flyover', 'planetarium', 'sumi-ocean'];
const viewports = [{width: 100, height: 14}, {width: 50, height: 7}, {width: 24, height: 3}];
const env = {FORCE_COLOR: '3'};
await configureTerminalRenderer(env);
const displays = [false, true].map(transparentBackground => resolveDisplayMode({transparentBackground}, env));
const sink = Object.assign(new Writable({write(_chunk, _encoding, callback) { callback(); }}), {isTTY: true, columns: 100, rows: 30});
const input = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => input});
let rendered = 0;
const view = render(null, {
  stdout: sink, stderr: sink, stdin: input, interactive: true,
  isScreenReaderEnabled: false,
  patchConsole: false, exitOnCtrlC: false, maxFps: 100_000,
  kittyKeyboard: {mode: 'disabled'}, onRender: () => { rendered++; }
});
async function renderFrame(style, pulse, profile) {
  const {width, height} = viewports[profile % viewports.length];
  const display = displays[profile % displays.length];
  const rows = buildVisualizer(style, pulse, width, height, null, playback, profile % 2 ? 'mono' : 'amber', width === 24 ? 'micro' : 'standard');
  view.rerender(React.createElement(DisplayContext.Provider, {value: display},
    React.createElement(Box, {width, height, flexDirection: 'column', overflow: 'hidden', backgroundColor: display.panel},
      rows.map((row, key) => React.createElement(ReceiverVisualRow, {key, row, width, ascii: profile % 2 === 1, backgroundColor: display.panel})))));
  await view.waitUntilRenderFlush();
}

let result;
try {
  // Warm every style and viewport before measuring initialization/JIT separately
  // from retention. Let React finish its work before collecting the heap.
  for (const style of receiverStyleNames) {
    for (let profile = 0; profile < 6; profile++) await renderFrame(style, 0, profile);
  }
  await settle();
  global.gc();
  const baseline = process.memoryUsage();
  const baselineRendered = rendered;
  const samples = [];
  for (let index = 0; index < frames; index++) {
    // Half the frames stress the two richest scenes at full size. The rest
    // exercise style, viewport, palette, ASCII and background changes.
    const full = index % 2 === 0;
    await renderFrame(full ? scenes[index % 4 === 0 ? 0 : 1] : scenes[index % scenes.length], index + 1, full ? 0 : Math.floor(index / 7) % 6);
    if ((index + 1) % 250 === 0) {
      global.gc();
      samples.push({frame: index + 1, ...process.memoryUsage()});
    }
  }
  await settle();
  global.gc();
  const final = process.memoryUsage();
  const heapGrowthBytes = final.heapUsed - baseline.heapUsed;
  result = {node: process.version, platform: process.platform, arch: process.arch, runtime: process.env.NODE_ENV, frames, rendered: rendered - baselineRendered, baseline, final, heapGrowthBytes, performanceMeasures: performance.getEntriesByType('measure').length, samples};
} finally {
  view.unmount();
  await view.waitUntilExit();
  input.destroy();
  sink.destroy();
}
console.log(JSON.stringify(result));
assert(result.rendered >= frames, 'Every requested frame must actually render');
assert(result.heapGrowthBytes < 8 * 1024 * 1024, `Retained heap grew by ${result.heapGrowthBytes} bytes (limit 8 MiB)`);
