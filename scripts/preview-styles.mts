/** Dev-only: render receiver styles to ANSI truecolor in the terminal. */
import {buildVisualizer} from '../src/ui/visualizers/receiver-visualizers.js';

const styles = process.argv[2] ? process.argv[2].split(',') : ['skyline', 'golden-gate', 'manhattan', 'alpine', 'stormfront'];
const pulse = Number(process.argv[3] ?? 12);
const width = Number(process.argv[4] ?? 100);
const height = Number(process.argv[5] ?? 14);

const playback = {state: 'playing', ready: true} as never;

function esc(cell: {text: string; color: string; backgroundColor?: string; bold?: boolean}): string {
  const fg = hexToAnsi(cell.color, 38);
  const bg = cell.backgroundColor ? hexToAnsi(cell.backgroundColor, 48) : '';
  const bold = cell.bold ? '[1m' : '';
  return `${bold}${fg}${bg}${cell.text}[0m`;
}

function hexToAnsi(hex: string, base: number): string {
  const n = Number.parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return `[${base};2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

for (const style of styles) {
  const rows = buildVisualizer(style as never, pulse, width, height, null, playback, 'ruby' as never);
  console.log(`\n=== ${style} (pulse=${pulse}) ===`);
  for (const row of rows) {
    if (row.segments) {
      console.log(row.segments.map(seg => esc({text: seg.text, color: seg.color, backgroundColor: seg.backgroundColor, bold: seg.bold})).join(''));
    } else {
      console.log(row.text);
    }
  }
}
