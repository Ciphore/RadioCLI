import {describe, expect, it} from 'vitest';
import {computeTerminalLayout} from './layout.js';
import {computeExploreMapLayout} from './explore-map-layout.js';
import {
  exploreCursorForMouseCell,
  parseSgrMouseEvents,
  parseTerminalMouseEvents,
  primaryMousePress,
  shouldEnableMouseReporting,
  wheelScrollDelta
} from './terminal-mouse.js';

describe('terminal mouse helpers', () => {
  it('parses SGR mouse clicks and ignores releases or wheel events as map placements', () => {
    const click = parseSgrMouseEvents('\u001B[<0;12;9M');
    expect(click).toEqual([{button: 0, x: 12, y: 9, pressed: true}]);
    expect(primaryMousePress(click)).toEqual({button: 0, x: 12, y: 9, pressed: true});

    expect(primaryMousePress(parseSgrMouseEvents('\u001B[<0;12;9m'))).toBeNull();
    expect(primaryMousePress(parseSgrMouseEvents('\u001B[<64;12;9M'))).toBeNull();
  });

  it('recognizes vertical wheel events as list scroll deltas', () => {
    expect(wheelScrollDelta(parseSgrMouseEvents('\u001B[<64;12;9M'))).toBe(-1);
    expect(wheelScrollDelta(parseSgrMouseEvents('\u001B[<65;12;9M'))).toBe(1);
    expect(wheelScrollDelta(parseSgrMouseEvents('\u001B[<66;12;9M'))).toBe(0);
    expect(wheelScrollDelta(parseSgrMouseEvents('\u001B[<65;12;9m'))).toBe(0);
  });

  it('supports legacy X10 wheel reports from terminals without SGR mouse mode', () => {
    const wheelDown = Buffer.from([0x1b, 0x5b, 0x4d, 65 + 32, 12 + 32, 9 + 32]);
    expect(parseTerminalMouseEvents(wheelDown)).toEqual([
      {button: 65, x: 12, y: 9, pressed: true}
    ]);
    expect(wheelScrollDelta(parseTerminalMouseEvents(wheelDown))).toBe(1);
  });

  it('captures the mouse only for Explore or overflowing selectable screens', () => {
    expect(shouldEnableMouseReporting('explore', 0, 20)).toBe(true);
    expect(shouldEnableMouseReporting('settings', 21, 10)).toBe(true);
    expect(shouldEnableMouseReporting('settings', 10, 21)).toBe(false);
    expect(shouldEnableMouseReporting('now-playing', 100, 10)).toBe(false);
    expect(shouldEnableMouseReporting('countries', 100, 10, false)).toBe(false);
  });

  it('maps terminal cells inside the Explore map back to world coordinates', () => {
    const layout = computeTerminalLayout(120, 40, 2);
    const frameWidth = 118;
    const mapLayout = computeExploreMapLayout(frameWidth, layout.contentRows, layout.stationRows);
    const mapInnerLeft = 3;
    const mapInnerTop = layout.topRows + mapLayout.headerRows + 3;

    const cursor = exploreCursorForMouseCell(
      mapInnerLeft + Math.floor(mapLayout.mapColumns / 2),
      mapInnerTop + Math.floor(mapLayout.mapRows / 2),
      frameWidth,
      layout
    );

    expect(cursor?.longitude).toBeCloseTo(0, 1);
    expect(cursor?.latitude).toBeCloseTo(90 - ((Math.floor(mapLayout.mapRows / 2) + 0.5) / mapLayout.mapRows) * 180, 4);
    expect(exploreCursorForMouseCell(mapInnerLeft + mapLayout.mapColumns, mapInnerTop, frameWidth, layout)).toBeNull();
  });
});
