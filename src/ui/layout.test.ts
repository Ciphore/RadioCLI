import {describe, expect, it} from 'vitest';
import {computeTerminalLayout} from './layout.js';
import {computeExploreMapLayout} from './explore-map-layout.js';

describe('computeTerminalLayout', () => {
  it('switches to compact mode for tiny terminals', () => {
    const layout = computeTerminalLayout(50, 12);
    expect(layout.compact).toBe(true);
    expect(layout.mode).toBe('compact');
    expect(layout.stationRows).toBeGreaterThan(0);
  });

  it('uses a purpose-built micro layout without exceeding the terminal', () => {
    for (const [columns, rows] of [[20, 8], [33, 9], [1, 1]] as const) {
      const layout = computeTerminalLayout(columns, rows, 4);
      expect(layout.mode).toBe('micro');
      expect(layout.frameWidth).toBeLessThanOrEqual(columns);
      expect(layout.contentRows + layout.topRows + layout.footerRows).toBeLessThanOrEqual(rows);
      expect(layout.contentRows).toBeGreaterThan(0);
    }
  });

  it('enters the full layout only when both dimensions can hold it', () => {
    expect(computeTerminalLayout(67, 40).mode).toBe('compact');
    expect(computeTerminalLayout(100, 21).mode).toBe('compact');
    expect(computeTerminalLayout(68, 22).mode).toBe('full');
  });

  it('reserves two compact footer rows and adds a third when height permits', () => {
    expect(computeTerminalLayout(50, 10).footerRows).toBe(2);
    expect(computeTerminalLayout(50, 13).footerRows).toBe(2);
    expect(computeTerminalLayout(50, 14).footerRows).toBe(3);
    expect(computeTerminalLayout(33, 14).footerRows).toBe(1);
  });

  it('never manufactures width that the terminal does not have', () => {
    for (const columns of [1, 2, 20, 33, 34, 67, 68, 120]) {
      const layout = computeTerminalLayout(columns, 24);
      expect(layout.frameWidth + layout.horizontalPadding * 2).toBe(columns);
      expect(layout.receiverWidth).toBe(layout.frameWidth);
    }
  });

  it('scales list rows with height', () => {
    const short = computeTerminalLayout(100, 24);
    const tall = computeTerminalLayout(100, 42);
    expect(tall.stationRows).toBeGreaterThan(short.stationRows);
    expect(tall.countryRows).toBeGreaterThan(short.countryRows);
    expect(short.stationRows).toBe(13);
    expect(short.countryRows).toBe(14);
    expect(computeTerminalLayout(124, 33).stationRows).toBe(22);
    expect(computeTerminalLayout(159, 45).countryRows).toBe(35);
  });

  it('expands receiver width with wide terminals', () => {
    expect(computeTerminalLayout(200, 40).receiverWidth).toBe(198);
    expect(computeTerminalLayout(72, 24).receiverWidth).toBe(70);
  });

  it('aligns the receiver panel with the shared top-navigation frame', () => {
    for (const columns of [64, 80, 120, 200]) {
      expect(computeTerminalLayout(columns, 40).receiverWidth).toBe(columns - 2);
    }
  });

  it('uses compact map mode when space is limited', () => {
    expect(computeTerminalLayout(80, 22).mapMode).toBe('compact');
    expect(computeTerminalLayout(100, 32).mapMode).toBe('full');
  });

  it('expands receiver rows with terminal height', () => {
    expect(computeTerminalLayout(120, 24).receiverRows).toBe(18);
    expect(computeTerminalLayout(120, 45).receiverRows).toBe(39);
  });

  it('reserves fixed rows for tabs and footer', () => {
    const layout = computeTerminalLayout(140, 34);
    expect(layout.topRows).toBe(3);
    expect(layout.footerRows).toBe(2);
    expect(layout.contentRows).toBe(29);
  });

  it('can reserve a live playback row above shortcuts', () => {
    const layout = computeTerminalLayout(140, 34, 3);
    expect(layout.footerRows).toBe(3);
    expect(layout.contentRows).toBe(28);
    expect(layout.stationRows).toBe(22);
  });
});

describe('computeExploreMapLayout', () => {
  it('prevents horizontal stretching of the braille world projection', () => {
    for (const [width, height] of [[68, 17], [80, 22], [100, 25], [118, 35], [158, 40]] as const) {
      const map = computeExploreMapLayout(width, height, 20);
      expect(map.mapColumns).toBeLessThanOrEqual(map.mapRows * 4);
      expect(map.mapOffsetX + map.mapColumns).toBeLessThanOrEqual(map.mapPanelWidth - 2);
      expect(map.mapColumns).toBeGreaterThan(0);
      expect(map.mapRows).toBeGreaterThan(0);
    }
  });

  it('keeps intermediate-width Explore side-by-side without stretching the map', () => {
    const map = computeExploreMapLayout(100, 24, 10);
    expect(map.split).toBe(true);
    expect(map.mapPanelWidth + map.listPanelWidth + 1).toBe(map.contentWidth);
    expect(map.mapColumns).toBeLessThanOrEqual(map.mapRows * 4);
  });
});
