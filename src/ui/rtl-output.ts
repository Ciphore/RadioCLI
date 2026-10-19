import type {WriteStream} from 'node:tty';
import {stripVTControlCharacters} from 'node:util';
import {rightToLeftPattern, strongDirectionPattern} from './bidi-ranges.js';
import {displayWidth} from './format.js';

// Ink writes complete VT sequences. Keep OSC payloads (titles, hyperlinks) out
// of text analysis, and treat cursor controls as boundaries between text runs.
const controls = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[78@-_])|[\u0000-\u001F\u007F]/gu;
const sgr = /^\u001B\[[\d;:]*m$/u;
const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

/**
 * Yoga's boxes become a single terminal row, not independently positioned
 * fields. Guard fixed fields and borders against terminal-side shaping in
 * mixed RTL rows by explicitly positioning the columns around each RTL run.
 * Apple Terminal's xterm profile also gets Unicode isolates to contain stored
 * row reordering independently of cursor reports. Keep those opt-in: older
 * Linux/BSD consoles may print unsupported format marks.
 * Ordinary LTR output stays byte-for-byte unchanged.
 *
 * Apply only to Ink's interactive stdout, after its cell layout/tokenization:
 * inserting zero-width bidi marks into Text would itself consume Ink cells.
 */
export function rtlSafeOutput(stdout: WriteStream, env: NodeJS.ProcessEnv = process.env): WriteStream {
  const isolate = env.TERM_PROGRAM === 'Apple_Terminal' && /^xterm(?:-|$)/i.test(env.TERM ?? '');
  let column: number | undefined = 0;
  let savedColumn: number | undefined;

  const position = (control: string): void => {
    if (control === '\n' || control === '\r') column = 0;
    else if (control === '\b' && column !== undefined) column = Math.max(0, column - 1);
    else if (control === '\t' && column !== undefined) column = (Math.floor(column / 8) + 1) * 8;
    else if (control === '\u001B7' || control === '\u001B[s') savedColumn = column;
    else if (control === '\u001B8' || control === '\u001B[u') column = savedColumn;
    else {
      const csi = /^\u001B\[([\d;]*)([G`CDaHEFf])$/u.exec(control);
      if (!csi) return;
      const parameters = csi[1]!.split(';').map(value => Number(value) || 1);
      const command = csi[2];
      if (command === 'G' || command === '`') column = parameters[0]! - 1;
      else if (command === 'H' || command === 'f') column = (parameters[1] ?? 1) - 1;
      else if (command === 'E' || command === 'F') column = 0;
      else if (column !== undefined) column = Math.max(0, column + (command === 'D' ? -1 : 1) * parameters[0]!);
    }
  };

  const text = (span: string, endsRow = false): string => {
    const plain = stripVTControlCharacters(span);
    const hasRtl = rightToLeftPattern.test(plain);
    // Animation frames contain many art-only rows. Their next newline resets
    // the column, so do not remeasure thousands of unchanged visualizer cells.
    if (!hasRtl && endsRow) return span;
    const startColumn = column;
    if (column !== undefined) column += displayWidth(plain);
    if (startColumn === undefined || !hasRtl) return span;

    type Edge = {index: number; column: number};
    const runs: Array<{first: Edge; last: Edge}> = [];
    let first: Edge | undefined;
    let last: Edge | undefined;
    let offset = startColumn;
    const finish = (): void => {
      if (first && last) runs.push({first, last});
      first = undefined; last = undefined;
    };
    // Segment the complete visible text: SGR can occur inside a combining or
    // emoji cluster. Map its UTF-16 edges back to the original styled span.
    const indices: number[] = [];
    let from = 0;
    for (const match of span.matchAll(new RegExp(controls))) {
      for (let index = from; index < match.index; index++) indices.push(index);
      from = match.index + match[0].length;
    }
    for (let index = from; index < span.length; index++) indices.push(index);
    // Neutral characters between RTL words belong to the same run, preserving
    // Arabic word order without absorbing trailing padding or fixed fields.
    for (const part of segmenter.segment(plain)) {
      const width = displayWidth(part.segment);
      const strong = strongDirectionPattern.exec(part.segment)?.[0];
      if (strong && rightToLeftPattern.test(strong)) {
        first ??= {index: indices[part.index]!, column: offset};
        last = {index: indices[part.index + part.segment.length - 1]! + 1, column: offset + width};
      } else if (strong) finish();
      offset += width;
    }
    finish();
    const at = (value: number): string => `\u001B[${value + 1}G`;
    let result = '';
    from = 0;
    for (const run of runs) {
      result += span.slice(from, run.first.index) + at(run.first.column)
        + (isolate ? '\u2067' : '') + span.slice(run.first.index, run.last.index)
        + (isolate ? '\u2069' : '') + at(run.last.column);
      from = run.last.index;
    }
    return result + span.slice(from);
  };

  const transform = (value: string): string => {
    let result = '';
    let from = 0;
    for (const match of value.matchAll(new RegExp(controls))) {
      if (sgr.test(match[0])) continue;
      result += text(value.slice(from, match.index), match[0] === '\n' || match[0] === '\r') + match[0];
      position(match[0]);
      from = match.index + match[0].length;
    }
    return result + text(value.slice(from));
  };

  const write: WriteStream['write'] = (chunk: unknown, ...args: unknown[]): boolean => {
    // Ink frames are strings. Preserve other writes and their encoding/callback
    // contract; resume anchoring only after a known cursor position or newline.
    if (typeof chunk !== 'string') column = undefined;
    return Reflect.apply(stdout.write, stdout, [typeof chunk === 'string' ? transform(chunk) : chunk, ...args]) as boolean;
  };
  return new Proxy(stdout, {
    get(target, key) {
      if (key === 'write') return write;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
