import {afterEach, describe, expect, it, vi} from 'vitest';
import {CliOutput} from './output.js';
import {JsonLibraryStore} from '../storage/store.js';
import {displayWidth} from '../ui/format.js';
import type {Station} from '../types.js';

const flags = {json: false, plain: false, quiet: false, noInput: false, noColor: false};
const station: Station = {id: 'test', provider: 'playlist', name: '東京 Jazz\u001b]0;bad title\u0007\nFM', country: 'Japan', countryCode: 'JP', tags: [], codec: 'MP3', bitrate: 128};
const settings = new JsonLibraryStore('/nonexistent-radiocli-output-fixture/library.json').snapshot().settings;
afterEach(() => vi.restoreAllMocks());

describe('terminal and machine output', () => {
  it('aligns Unicode tables within the terminal width and strips untrusted escape sequences', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const output = new CliOutput(flags, settings, {isTTY: true, columns: 42}, {NO_COLOR: '1', LANG: 'en_US.UTF-8'});
    output.stations([station], [station]);
    const rendered = String(log.mock.calls[0]![0]);
    const table = rendered.split('\n\n')[0]!;
    expect(table).not.toContain('\u001b');
    expect(table).toContain('*');
    expect(table).toContain('東京');
    for (const line of table.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(41);
    expect(table).toMatch(/STATION\s{2,}COUNTRY/);
  });

  it('keeps escape codes out of pipes even when FORCE_COLOR is set', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const output = new CliOutput(flags, settings, {isTTY: false, columns: 80}, {FORCE_COLOR: '3'});
    output.stations([station], []);
    const rendered = String(log.mock.calls[0]![0]);
    expect(rendered).not.toContain('\u001b');
    expect(rendered.split('\t')).toHaveLength(5);
    expect(rendered).toContain('東京 Jazz FM');
  });

  it('honors ASCII and no-color preferences on a terminal', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const output = new CliOutput({...flags, noColor: true}, {...settings, asciiMode: true}, {isTTY: true, columns: 40}, {FORCE_COLOR: '3'});
    output.stations([{...station, name: 'A station with a very long name', country: undefined}], []);
    const rendered = String(log.mock.calls[0]![0]);
    expect(rendered).not.toContain('\u001b');
    expect(rendered).not.toMatch(/[—…·]/);
  });

  it('uses the saved theme only for terminal headings', () => {
    const output = new CliOutput(flags, {...settings, theme: 'amber'}, {isTTY: true, columns: 80}, {FORCE_COLOR: '3'});
    expect(output.heading('Listening')).toBe('\u001b[1;38;2;255;176;0mListening\u001b[0m');
    const plain = new CliOutput({...flags, plain: true}, settings, {isTTY: true, columns: 80}, {FORCE_COLOR: '3'});
    expect(plain.heading('Listening')).toBe('Listening');
  });
});
