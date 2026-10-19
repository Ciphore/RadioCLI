import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';
import type {WriteStream} from 'node:tty';
import {pathToFileURL} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
import {act, type ComponentProps} from 'react';
import {Box, render as inkRender, renderToString} from 'ink';
import {cleanup, render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {rightToLeftPattern} from './bidi-ranges.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {displayWidth} from './format.js';
import {rtlSafeOutput} from './rtl-output.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';

const inkRequire = createRequire(import.meta.resolve('ink'));
const inkChalk = (await import(pathToFileURL(inkRequire.resolve('chalk')).href)).default as {level: number};
const originalColorLevel = inkChalk.level;
const reportedName = 'Radio Wa3 (راديو وع)';
const props: ComponentProps<typeof NowPlayingScreen> = {
  station: {id: 'wa3', provider: 'radio-browser', name: reportedName, country: 'France', tags: []},
  playback: {backend: 'mpv', state: 'playing', ready: true, volume: 70, muted: false},
  metadata: {title: 'Svarog – The Way To', updatedAt: '2026-10-17T12:00:00Z'},
  theme: 'green', favorite: false, diagnostics: {backend: 'mpv', availableBackends: ['mpv'], preferredBackend: 'auto', active: true, volume: 70, muted: false, ready: true},
  showDiagnostics: false, stationTime: '12:00', receiverStyle: 'gallop-fine', trackHistory: [], width: 74, height: 16
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('INK_SCREEN_READER', 'false');
  vi.stubEnv('TERM_PROGRAM', undefined);
});
afterEach(() => {
  act(() => cleanup());
  inkChalk.level = originalColorLevel;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function output(isolate = true): {stream: WriteStream; written: () => string} {
  const sink = new PassThrough();
  let written = '';
  sink.on('data', chunk => { written += String(chunk); });
  return {stream: rtlSafeOutput(sink as unknown as WriteStream, {TERM_PROGRAM: isolate ? 'Apple_Terminal' : undefined, TERM: 'xterm-256color'}), written: () => written};
}

function frame(element: Parameters<typeof renderToString>[0], columns: number): string {
  let value = '';
  act(() => { value = renderToString(element, {columns}); });
  return value;
}

function visibleText(value: string): string {
  return stripVTControlCharacters(value).replace(/[\u2067\u2069]/gu, '');
}

// Fault injection: let RTL glyph advances differ from the layout's cell widths.
// This tests containment, not any particular OS's Arabic shaping algorithm.
// An explicit column position must recover the suffix independently of that
// discrepancy. The unanchored screenshot row shifts PLAYING by seven cells.
function paintedRow(value: string, rtlAdvance = 1): string {
  const row: string[] = [];
  let column = 0;
  for (const token of value.matchAll(/\u001B\[[\d;?]*[A-Za-z]|[^\u001B]/gu)) {
    const character = token[0];
    const at = /^\u001B\[(\d*)G$/u.exec(character);
    if (at) column = (Number(at[1]) || 1) - 1;
    else if (character.startsWith('\u001B')) continue;
    else {
      row[column] = character;
      const width = displayWidth(character);
      column += rightToLeftPattern.test(character) ? rtlAdvance : width;
    }
  }
  // Index cells, not UTF-16 code units from emoji/supplementary glyphs.
  return Array.from({length: row.length}, (_, index) => {
    const cell = row[index] ?? ' ';
    return cell.length === 1 ? cell : '@';
  }).join('');
}

describe('RTL terminal field containment', () => {
  it.each([
    {TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color', isolate: true},
    {TERM_PROGRAM: 'Apple_Terminal', TERM: 'linux', isolate: false},
    {TERM_PROGRAM: undefined, TERM: 'linux', isolate: false},
    {TERM_PROGRAM: undefined, TERM: 'cons25', isolate: false},
    {TERM_PROGRAM: 'Windows_Terminal', TERM: 'xterm-256color', isolate: false},
    {TERM_PROGRAM: undefined, TERM: 'xterm-256color', isolate: false}
  ])('uses compatible RTL output for %j', ({isolate, ...env}) => {
    const sink = new PassThrough(); let written = '';
    sink.on('data', chunk => { written += String(chunk); });
    rtlSafeOutput(sink as unknown as WriteStream, env).write('Radio راديو PLAYING │');
    expect(written).toContain('\u001B[7G');
    expect(written.includes('\u2067')).toBe(isolate);
    expect(written.includes('\u2069')).toBe(isolate);
  });
  it.each([false, true])('anchors the same fields with Unicode isolation=%s', isolate => {
    const capture = output(isolate);
    const original = 'Radio Wa3 (راديو وع) · FRANCE      PLAYING │';
    capture.stream.write(original);
    expect(visibleText(capture.written())).toBe(original);
    expect(capture.written().includes('\u2067')).toBe(isolate);
    expect(capture.written().includes('\u2069')).toBe(isolate);
    expect(paintedRow(capture.written(), 2).indexOf('PLAYING')).toBe(original.indexOf('PLAYING'));
    expect(paintedRow(capture.written(), 2).lastIndexOf('│')).toBe(original.length - 1);
  });

  it('defaults to anchors without Unicode format marks for unknown terminals', () => {
    const sink = new PassThrough(); let written = '';
    sink.on('data', chunk => { written += String(chunk); });
    rtlSafeOutput(sink as unknown as WriteStream).write('Radio راديو PLAYING │');
    expect(written).toContain('\u001B[7Gراديو\u001B[12G');
    expect(written).not.toMatch(/[\u2066-\u2069]/u);
  });
  it('keeps PLAYING and the border fixed when the reported Arabic name shapes wider', () => {
    inkChalk.level = 0;
    const row = frame(<NowPlayingScreen {...props} />, props.width)
      .split('\n').find(line => line.includes('PLAYING'))!;
    expect(row).toContain(reportedName);
    expect(paintedRow(row, 2).indexOf('PLAYING')).toBe(70);
    const capture = output();
    capture.stream.write(row);
    const anchored = capture.written();
    expect(visibleText(anchored)).toBe(row);
    expect(displayWidth(anchored)).toBe(displayWidth(row));
    const isolated = anchored.match(/\u2067(.*?)\u2069/u)?.[1];
    expect(isolated).toBe('راديو وع');
    expect(isolated).not.toContain('PLAYING');
    for (const advance of [1, 2, 3]) {
      const painted = paintedRow(anchored, advance);
      expect(painted.indexOf('PLAYING')).toBe(63);
      expect(painted.lastIndexOf('│')).toBe(73);
    }
  });

  it('preserves Arabic word order, combining clusters and styles between the anchors', () => {
    const capture = output();
    const name = '\u001B[1mرَادِيو وَع\u001B[22m';
    capture.stream.write(`Radio (${name}) · FRANCE   PLAYING │`);
    expect(capture.written()).toContain(`\u001B[1m\u001B[8G\u2067رَادِيو وَع\u2069\u001B[16G\u001B[22m)`);
    expect(visibleText(capture.written())).toBe(`Radio (رَادِيو وَع) · FRANCE   PLAYING │`);
  });

  it('keeps a final combining mark inside the isolate across a color boundary', () => {
    const capture = output();
    const original = 'Radio (وع\u001B[31mَ\u001B[39m) PLAYING │';
    capture.stream.write(original);
    expect(capture.written()).toContain('\u2067وع\u001B[31mَ\u2069');
    expect(visibleText(capture.written())).toBe(stripVTControlCharacters(original));
    expect(displayWidth(capture.written())).toBe(displayWidth(original));
    expect(paintedRow(capture.written()).indexOf('PLAYING')).toBe(displayWidth(stripVTControlCharacters(original).split('PLAYING')[0]!));
  });

  it('measures an emoji cluster across styles before positioning an RTL run', () => {
    const capture = output();
    const original = 'Radio 👩\u001B[31m🏽‍\u001B[39m💻 راديو PLAYING │';
    capture.stream.write(original);
    expect(capture.written()).toContain('\u001B[10G\u2067راديو\u2069\u001B[15G');
    expect(visibleText(capture.written())).toBe(stripVTControlCharacters(original));
    expect(displayWidth(capture.written())).toBe(displayWidth(original));
    expect(paintedRow(capture.written()).indexOf('PLAYING')).toBe(displayWidth(stripVTControlCharacters(original).split('PLAYING')[0]!));
  });

  it('leaves Latin, CJK, emoji and no-color output byte-for-byte unchanged', () => {
    const capture = output();
    const frame = '\u001B[38;2;116;242;138m│ Café 東京 👩🏽‍💻 FM     PLAYING │\u001B[39m\n';
    capture.stream.write(frame);
    expect(capture.written()).toBe(frame);
  });

  it('tracks separate writes, CRLF, incremental redraws, horizontal offsets and cursor restore', () => {
    const capture = output();
    for (const chunk of ['prefix ', 'راديو', ' suffix\r\n', '\u001B[2A\u001B[4G', 'وع', '\u001B[s\u001B[10G', 'وع', '\u001B[u', 'وع', '\r', 'وع']) capture.stream.write(chunk);
    expect(capture.written().replace(/[\u2067\u2069]/gu, '')).toBe('prefix \u001B[8Gراديو\u001B[13G suffix\r\n\u001B[2A\u001B[4G\u001B[4Gوع\u001B[6G\u001B[s\u001B[10G\u001B[10Gوع\u001B[12G\u001B[u\u001B[6Gوع\u001B[8G\r\u001B[1Gوع\u001B[3G');
  });

  it('does not inspect or modify OSC titles and hyperlinks', () => {
    const capture = output();
    const frame = '\u001B]0;راديو\u0007\u001B]8;;https://example.test/وع\u001B\\Radio\u001B]8;;\u001B\\';
    capture.stream.write(frame);
    expect(capture.written()).toBe(frame);
  });

  it('retains write callbacks, backpressure, resize events and live stream properties', async () => {
    const sink = new PassThrough({highWaterMark: 1});
    const stream = rtlSafeOutput(sink as unknown as WriteStream);
    const resized = vi.fn();
    stream.on('resize', resized);
    Object.assign(sink, {columns: 74, isTTY: true});
    expect(stream.columns).toBe(74);
    expect(stream.isTTY).toBe(true);
    expect(stream.write('راديو', 'utf8')).toBe(false);
    sink.emit('resize');
    expect(resized).toHaveBeenCalledOnce();
    Object.assign(sink, {columns: 98});
    expect(stream.columns).toBe(98);
    sink.resume();
    await new Promise<void>((resolve, reject) => stream.write('done', error => error ? reject(error) : resolve()));
    stream.off('resize', resized);
    sink.emit('resize');
    expect(resized).toHaveBeenCalledOnce();
  });

  it('preserves binary writes and recovers positioning at the next known row', () => {
    const capture = output();
    capture.stream.write(Buffer.from('prefix '));
    capture.stream.write('وع');
    capture.stream.write('\r\nوع');
    expect(capture.written()).toBe('prefix وع\r\n\u001B[1G\u2067وع\u2069\u001B[3G');
  });

  it('isolates separate RTL runs without pulling intervening Latin text into RTL order', () => {
    const capture = output();
    capture.stream.write('Radio راديو World العربية · PLAYING │');
    const runs = [...capture.written().matchAll(/\u2067(.*?)\u2069/gu)].map(match => match[1]);
    expect(runs).toEqual(['راديو', 'العربية']);
    expect(visibleText(capture.written())).toBe('Radio راديو World العربية · PLAYING │');
  });
});

const profiles = [
  {name: 'truecolor', asciiMode: false, transparentBackground: false, color: 3},
  {name: '256-color', asciiMode: false, transparentBackground: false, color: 2},
  {name: '16-color', asciiMode: false, transparentBackground: true, color: 1},
  {name: 'no-color', asciiMode: false, transparentBackground: true, color: 0},
  {name: 'ASCII', asciiMode: true, transparentBackground: false, color: 3},
  {name: 'ASCII no-color', asciiMode: true, transparentBackground: true, color: 0}
];
const names = [reportedName, 'رَادِيو وَع International', 'FM שלום World', 'رادیو ایران / Radio', 'اردو ریڈیو FM', 'Radio 東京 👩🏽‍💻 راديو', reportedName.repeat(8)];
for (const profile of profiles.flatMap(value => [false, true].map(isolate => ({...value, isolate})))) {
  describe(`Now playing RTL / ${profile.name} / isolation=${profile.isolate}`, () => {
    it.each([62, 74, 98])('contains all playback states and international names at %i columns', width => {
      inkChalk.level = profile.color;
      const display = resolveDisplayMode(profile, {FORCE_COLOR: String(profile.color)});
      for (const name of names) for (const state of ['playing', 'loading', 'paused', 'stopped', 'idle', 'error'] as const) {
        const rendered = frame(
          <DisplayContext.Provider value={display}><Box width={width + 2} paddingX={1} backgroundColor={display.app} overflow="hidden">
            <NowPlayingScreen {...props} station={{...props.station!, name}} playback={{...props.playback, state}} width={width} />
          </Box></DisplayContext.Provider>, width + 2
        );
        const capture = output(profile.isolate);
        capture.stream.write(rendered);
        expect(visibleText(capture.written())).toBe(stripVTControlCharacters(rendered));
        const row = capture.written().split('\n').find(line => line.includes(state.toUpperCase()))!;
        const expected = width - 3 - state.length;
        for (const advance of [1, 2]) expect(paintedRow(row, advance).indexOf(state.toUpperCase()), `${name}: ${state}`).toBe(expected);
        expect(displayWidth(stripVTControlCharacters(row))).toBeLessThanOrEqual(width + 2);
        expect(paintedRow(row).lastIndexOf(profile.asciiMode ? '|' : '│')).toBe(width);
      }
    });
  });
}

it('retains containment through station changes, playback updates and resizes', () => {
  inkChalk.level = 3;
  let view!: ReturnType<typeof render>;
  for (const width of [74, 98, 62, 74]) for (const name of [reportedName, 'Test FM', ...names]) {
    act(() => {
      const element = <NowPlayingScreen {...props} station={{...props.station!, name}} width={width} />;
      if (view) view.rerender(element); else view = render(element);
    });
    const capture = output();
    capture.stream.write(view.lastFrame()!);
    const row = capture.written().split('\n').find(line => line.includes('PLAYING'))!;
    expect(paintedRow(row, 2).indexOf('PLAYING')).toBe(width - 11);
    expect(paintedRow(row).lastIndexOf('│')).toBe(width - 1);
  }
});

it.each([{incrementalRendering: false, isolate: false}, {incrementalRendering: true, isolate: false}, {incrementalRendering: false, isolate: true}, {incrementalRendering: true, isolate: true}])('anchors real interactive Ink updates with %j', async ({incrementalRendering, isolate}) => {
  inkChalk.level = 3;
  const sink = Object.assign(new PassThrough(), {isTTY: true, columns: 76, rows: 30});
  const input = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => input});
  let written = '';
  sink.on('data', chunk => { written += String(chunk); });
  let view!: ReturnType<typeof inkRender>;
  act(() => {
    view = inkRender(<NowPlayingScreen {...props} />, {
      stdout: rtlSafeOutput(sink as unknown as WriteStream, {TERM_PROGRAM: isolate ? 'Apple_Terminal' : undefined, TERM: 'xterm-256color'}), stdin: input as unknown as NodeJS.ReadStream,
      stderr: sink as unknown as WriteStream, patchConsole: false, exitOnCtrlC: false,
      interactive: true, incrementalRendering, kittyKeyboard: {mode: 'disabled'}
    });
  });
  try {
    await view.waitUntilRenderFlush();
    for (const width of [74, 62, 98]) {
      written = '';
      sink.columns = width + 2;
      act(() => {
        sink.emit('resize');
        view.rerender(<NowPlayingScreen {...props} playback={{...props.playback, state: 'paused'}} width={width} />);
      });
      await view.waitUntilRenderFlush();
      const row = written.split('\n').filter(line => line.includes('PAUSED')).at(-1)!;
      expect(row).toBeDefined();
      // Erase/redraw prefixes precede a fresh column-zero row.
      expect(paintedRow(row, 2).indexOf('PAUSED')).toBe(width - 10);
      expect(visibleText(row)).toContain(reportedName);
      expect(paintedRow(row).lastIndexOf('│')).toBe(width - 1);
    }
  } finally {
    act(() => { view.unmount(); view.cleanup(); });
    input.destroy(); sink.destroy();
  }
});
