import type {ExploreCursor} from './app-state.js';
import {cosmoCoordinateForCell} from './cosmo-world-map.js';
import {computeExploreMapLayout} from './explore-map-layout.js';
import type {TerminalLayout} from './layout.js';
import type {Screen} from '../types.js';

export type TerminalMouseEvent = {
  button: number;
  x: number;
  y: number;
  pressed: boolean;
};

export const enableMouseReporting = '\u001B[?1000h\u001B[?1006h';
export const disableMouseReporting = '\u001B[?1006l\u001B[?1000l';

const sgrMousePattern = /\u001B\[<(\d+);(\d+);(\d+)([Mm])/g;

export function parseSgrMouseEvents(input: string): TerminalMouseEvent[] {
  return Array.from(input.matchAll(sgrMousePattern), match => ({
    button: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
    pressed: match[4] === 'M'
  })).filter(event => Number.isFinite(event.button) && Number.isFinite(event.x) && Number.isFinite(event.y));
}

/** Parse modern SGR mouse reports and the legacy X10 form used by older terminals. */
export function parseTerminalMouseEvents(input: string | Uint8Array): TerminalMouseEvent[] {
  const text = String(input);
  const events = parseSgrMouseEvents(text);
  if (!(input instanceof Uint8Array)) return events;

  for (let index = 0; index <= input.length - 6; index += 1) {
    if (input[index] !== 0x1b || input[index + 1] !== 0x5b || input[index + 2] !== 0x4d) continue;
    const button = (input[index + 3] ?? 32) - 32;
    const x = (input[index + 4] ?? 32) - 32;
    const y = (input[index + 5] ?? 32) - 32;
    if (button < 0 || x < 1 || y < 1) continue;
    events.push({button, x, y, pressed: (button & 3) !== 3});
    index += 5;
  }
  return events;
}

const selectableMouseScreens = new Set<Screen>([
  'home', 'countries', 'map', 'stations', 'search', 'nearby', 'explore',
  'library', 'settings', 'help', 'airplay-settings'
]);

export function shouldEnableMouseReporting(
  screen: Screen,
  itemCount: number,
  visibleRows: number,
  mouseSupport = true
): boolean {
  if (!mouseSupport || !selectableMouseScreens.has(screen)) return false;
  // Explore also needs mouse clicks for map placement when its station list is short.
  return screen === 'explore' || itemCount > Math.max(0, visibleRows);
}

export function primaryMousePress(events: TerminalMouseEvent[]): TerminalMouseEvent | null {
  return events.find(event => event.pressed && (event.button & 3) === 0 && (event.button & 96) === 0) ?? null;
}

export function wheelScrollDelta(events: TerminalMouseEvent[]): number {
  return events.reduce((delta, event) => {
    if (!event.pressed) {
      return delta;
    }

    const button = event.button & 127;
    if (button === 64) {
      return delta - 1;
    }

    if (button === 65) {
      return delta + 1;
    }

    return delta;
  }, 0);
}

export function exploreCursorForMouseCell(
  x: number,
  y: number,
  frameWidth: number,
  layout: TerminalLayout
): ExploreCursor | null {
  if (layout.compact) {
    return null;
  }

  const mapLayout = computeExploreMapLayout(frameWidth, layout.contentRows, layout.stationRows);
  const contentLeft = 2;
  const contentTop = layout.topRows + 1;
  const mapOuterLeft = contentLeft;
  const mapOuterTop = contentTop + mapLayout.headerRows + 1;
  const mapInnerLeft = mapOuterLeft + 1;
  const mapInnerTop = mapOuterTop + 1;
  const col = Math.floor(x - mapInnerLeft);
  const row = Math.floor(y - mapInnerTop);

  if (col < 0 || col >= mapLayout.mapColumns || row < 0 || row >= mapLayout.mapRows) {
    return null;
  }

  const coordinate = cosmoCoordinateForCell(col, row, mapLayout.mapColumns, mapLayout.mapRows);
  return {
    latitude: coordinate.lat,
    longitude: coordinate.lon
  };
}
