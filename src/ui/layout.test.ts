import {describe, expect, it} from 'vitest';
import {computeTerminalLayout} from './layout.js';

describe('computeTerminalLayout', () => {
  it('switches to compact mode for tiny terminals', () => {
    const layout = computeTerminalLayout(50, 12);
    expect(layout.compact).toBe(true);
    expect(layout.stationRows).toBe(0);
  });

  it('scales list rows with height', () => {
    const short = computeTerminalLayout(100, 24);
    const tall = computeTerminalLayout(100, 42);
    expect(tall.stationRows).toBeGreaterThan(short.stationRows);
    expect(tall.countryRows).toBeGreaterThan(short.countryRows);
    expect(short.stationRows).toBe(6);
    expect(computeTerminalLayout(124, 33).stationRows).toBe(10);
    expect(computeTerminalLayout(159, 45).countryRows).toBe(36);
  });

  it('expands receiver width with wide terminals', () => {
    expect(computeTerminalLayout(200, 40).receiverWidth).toBe(196);
    expect(computeTerminalLayout(72, 24).receiverWidth).toBe(68);
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
    expect(layout.topRows).toBe(4);
    expect(layout.footerRows).toBe(1);
    expect(layout.contentRows).toBe(29);
  });
});
