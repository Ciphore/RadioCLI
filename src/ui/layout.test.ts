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
  });

  it('caps receiver width for wide terminals', () => {
    expect(computeTerminalLayout(200, 40).receiverWidth).toBe(88);
    expect(computeTerminalLayout(72, 24).receiverWidth).toBe(68);
  });

  it('uses compact map mode when space is limited', () => {
    expect(computeTerminalLayout(80, 22).mapMode).toBe('compact');
    expect(computeTerminalLayout(100, 32).mapMode).toBe('full');
  });
});
