import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import type {Station} from '../types.js';
import type {RadioSessionStatus} from '../agent/session.js';
import {CliOutput} from './output.js';

export function requireInteractive(action: '--pick' | '--watch'): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`${action} needs an interactive terminal. Use --json or --plain for scripts, and radiocli play <provider:id> to select a station directly.`);
}

/** A small line-mode chooser preserves scrollback and ordinary terminal editing. */
export async function pickStation(stations: Station[], output: CliOutput, favorites: Station[]): Promise<Station> {
  requireInteractive('--pick');
  if (!stations.length) throw new Error('No stations found. Try a broader search or remove a filter.');
  output.stations(stations, favorites, undefined, false);
  const input = createInterface({input: process.stdin, output: process.stderr});
  return new Promise<Station>((resolve, reject) => {
    let settled = false;
    const cancel = () => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('Selection cancelled.'), {name: 'AbortError'}));
      input.close();
    };
    input.once('SIGINT', cancel);
    input.once('close', cancel);
    const ask = () => input.question(`Play station [1-${stations.length}], or q to cancel: `, answer => {
      if (answer.trim().toLowerCase() === 'q' || !answer.trim()) { cancel(); return; }
      const index = /^\d+$/.test(answer.trim()) ? Number(answer.trim()) - 1 : -1;
      const station = stations[index];
      if (!station) { process.stderr.write(`Choose a number from 1 through ${stations.length}.\n`); ask(); return; }
      settled = true;
      input.close();
      resolve(station);
    });
    ask();
  });
}

export async function watchNow(read: (signal?: AbortSignal) => Promise<RadioSessionStatus | null>, output: CliOutput): Promise<void> {
  requireInteractive('--watch');
  const controller = new AbortController();
  const interrupt = () => { process.exitCode = 130; controller.abort(); };
  const terminate = () => { process.exitCode = 143; controller.abort(); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  const rewrite = output.terminal.interactive && !output.terminal.screenReader;
  let rendered = false;
  let previous = '';
  try {
    process.stderr.write('Watching playback. Ctrl+C exits this view; audio continues.\n');
    while (!controller.signal.aborted) {
      const status = await read(controller.signal);
      if (controller.signal.aborted) break;
      const line = output.fit(output.nowLine(status), Math.max(1, (process.stdout.columns || 100) - 1));
      if (!rendered || line !== previous) {
        process.stdout.write(rewrite ? `\r\u001b[2K${line}` : `${line}\n`);
        rendered = true;
        previous = line;
      }
      await delay(1000, undefined, {signal: controller.signal});
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    if (rendered && rewrite) process.stdout.write('\n');
  }
}
