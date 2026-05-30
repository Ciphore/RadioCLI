import {describe, expect, it} from 'vitest';
import {computeTerminalLayout} from './layout.js';
import {computeExploreMapLayout} from './explore-map-layout.js';
import {exploreCursorForMouseCell, parseSgrMouseEvents, primaryMousePress} from './terminal-mouse.js';

describe('terminal mouse helpers', () => {
  it('parses SGR mouse clicks and ignores releases or wheel events as map placements', () => {
    const click = parseSgrMouseEvents('\u001B[<0;12;9M');
    expect(click).toEqual([{button: 0, x: 12, y: 9, pressed: true}]);
    expect(primaryMousePress(click)).toEqual({button: 0, x: 12, y: 9, pressed: true});

    expect(primaryMousePress(parseSgrMouseEvents('\u001B[<0;12;9m'))).toBeNull();
    expect(primaryMousePress(parseSgrMouseEvents('\u001B[<64;12;9M'))).toBeNull();
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
