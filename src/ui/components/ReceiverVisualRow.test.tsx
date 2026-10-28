import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Box, Text, renderToString} from 'ink';
import {afterEach, describe, expect, it} from 'vitest';
import {receiverStyleNames, type PlaybackState, type ReceiverStyle} from '../../types.js';
import {toAsciiSafe} from '../ascii.js';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {configureTerminalRenderer} from '../terminal-renderer.js';
import {buildVisualizer} from '../visualizers/receiver-visualizers.js';
import {ReceiverVisualRow} from './ReceiverVisualRow.js';

const playback: PlaybackState = {state: 'playing', ready: true, backend: 'mpv', volume: 70, muted: false};
const inkRequire = createRequire(import.meta.resolve('ink'));
const inkChalk = (await import(pathToFileURL(inkRequire.resolve('chalk')).href)).default as {level: number};
const originalColorLevel = inkChalk.level;
afterEach(() => { inkChalk.level = originalColorLevel; });
const sizes = [
  {width: 100, height: 14, viewport: 'standard'},
  {width: 50, height: 7, viewport: 'standard'},
  {width: 24, height: 3, viewport: 'micro'}
] as const;

async function compare(style: ReceiverStyle, size: typeof sizes[number], ascii = false, level = 3, transparent = false): Promise<void> {
  const env = {FORCE_COLOR: String(level)};
  await configureTerminalRenderer(env);
  const display = resolveDisplayMode({transparentBackground: transparent}, env);
  const backgroundColor = size.width === 100 ? display.panel : display.app;
  const rows = buildVisualizer(style, 12_345, size.width, size.height, null, playback, 'amber', size.viewport);
  const a = (text: string): string => ascii ? toAsciiSafe(text) : text;
  const expected = renderToString(<Box width={size.width} flexDirection="column" backgroundColor={backgroundColor}>
    {rows.map((row, key) => <Text key={key} color={row.segments ? undefined : row.color}>
      {row.segments
        ? row.segments.map((segment, key) => <Text key={key} color={segment.color} backgroundColor={segment.backgroundColor} bold={segment.bold}>{a(segment.text)}</Text>)
        : a(row.text)}
    </Text>)}
  </Box>, {columns: size.width});
  const actual = renderToString(<DisplayContext.Provider value={display}>
    <Box width={size.width} flexDirection="column" backgroundColor={backgroundColor}>
      {rows.map((row, key) => <ReceiverVisualRow key={key} row={row} width={size.width} ascii={ascii} backgroundColor={backgroundColor} />)}
    </Box>
  </DisplayContext.Provider>, {columns: size.width});
  expect(actual, `${style}/${size.width}/ascii=${ascii}/colors=${level}/transparent=${transparent}`).toBe(expected);
}

describe('receiver output boundary', () => {
  it.each(receiverStyleNames)('preserves %s in full, compact and micro layouts', async style => {
    for (const size of sizes) await compare(style, size);
  });

  it.each([0, 1, 2, 3])('preserves scenery at color level %s with ASCII and transparent backgrounds', async level => {
    for (const style of ['manhattan', 'skyline', 'golden-gate', 'alpine', 'flyover', 'planetarium', 'sumi-ocean', 'equalizer'] as const) {
      for (const ascii of [false, true]) {
        for (const transparent of [false, true]) await compare(style, sizes[1], ascii, level, transparent);
      }
    }
  }, 30_000);

  it('respects a narrower parent clip without overwriting its neighbor', async () => {
    await configureTerminalRenderer({FORCE_COLOR: '0'});
    const display = resolveDisplayMode({}, {FORCE_COLOR: '0'});
    const row = {text: 'abcdefghij', color: '#ffffff'};
    const frame = renderToString(<DisplayContext.Provider value={display}>
      <Box width={8}>
        <Box width={5} height={1} overflow="hidden"><ReceiverVisualRow row={row} width={10} ascii={false} /></Box>
        <Text>END</Text>
      </Box>
    </DisplayContext.Provider>, {columns: 8});
    expect(frame).toBe('abcdeEND');
  });

  it('clips wide glyphs by terminal columns and preserves combining marks', async () => {
    await configureTerminalRenderer({FORCE_COLOR: '0'});
    const display = resolveDisplayMode({}, {FORCE_COLOR: '0'});
    const row = {text: '界e\u0301界x', color: '#ffffff'};
    const frame = renderToString(<DisplayContext.Provider value={display}>
      <Box width={4}><ReceiverVisualRow row={row} width={4} ascii={false} /></Box>
    </DisplayContext.Provider>, {columns: 4});
    expect(frame.trimEnd()).toBe('界e\u0301');
  });

  it('does not shift later segments into a clipped wide glyph', async () => {
    await configureTerminalRenderer({FORCE_COLOR: '0'});
    const display = resolveDisplayMode({}, {FORCE_COLOR: '0'});
    const row = {text: '界x', color: '#ffffff', segments: [{text: '界', color: '#ffffff'}, {text: 'x', color: '#ffffff'}]};
    const frame = renderToString(<DisplayContext.Provider value={display}>
      <Box width={1}><ReceiverVisualRow row={row} width={1} ascii={false} /></Box>
    </DisplayContext.Provider>, {columns: 1});
    expect(frame.trim()).toBe('');
  });

  it('keeps retained heap bounded across changing scenes and viewports in real Ink', async () => {
    const {stdout} = await promisify(execFile)(process.execPath, [
      '--expose-gc', '--import', 'tsx',
      fileURLToPath(new URL('../../../scripts/receiver-memory-smoke.mjs', import.meta.url)),
      '--frames=1000'
    ], {env: {...process.env, NODE_ENV: 'production'}, timeout: 120_000, maxBuffer: 1024 * 1024});
    const result = JSON.parse(stdout) as {heapGrowthBytes: number; frames: number};
    expect(result.frames).toBe(1000);
    expect(result.heapGrowthBytes).toBeLessThan(8 * 1024 * 1024);
  }, 125_000);
});
