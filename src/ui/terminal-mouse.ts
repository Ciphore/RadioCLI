import type {ExploreCursor} from './app-state.js';
import {cosmoCoordinateForCell} from './cosmo-world-map.js';
import {computeExploreMapLayout} from './explore-map-layout.js';
import type {TerminalLayout} from './layout.js';

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

export function primaryMousePress(events: TerminalMouseEvent[]): TerminalMouseEvent | null {
  return events.find(event => event.pressed && (event.button & 3) === 0 && (event.button & 96) === 0) ?? null;
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
