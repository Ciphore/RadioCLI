import {describe, expect, it} from 'vitest';
import type {Country} from '../../types.js';
import {buildWorldMap} from './MapScreen.js';

const countries: Country[] = [
  {code: 'US', name: 'The United States Of America', stationCount: 7168},
  {code: 'DE', name: 'Germany', stationCount: 5848},
  {code: 'RU', name: 'The Russian Federation', stationCount: 3046},
  {code: 'FR', name: 'France', stationCount: 2517},
  {code: 'MX', name: 'Mexico', stationCount: 2415},
  {code: 'GB', name: 'The United Kingdom', stationCount: 2159},
  {code: 'AU', name: 'Australia', stationCount: 2014},
  {code: 'BR', name: 'Brazil', stationCount: 1397}
];

describe('buildWorldMap', () => {
  it('plots recognizable country labels across the terminal map', () => {
    const map = buildWorldMap(countries, countries[0], 'full', 110);
    const text = map.rows.map(row => row.cells.map(cell => cell.char).join('')).join('\n');

    expect(map.plotted).toBe(countries.length);
    expect(map.unplotted).toBe(0);
    expect(text).toContain('US');
    expect(text).toContain('DE');
    expect(text).toContain('AU');
    expect(text).toMatch(/[·●•]/);
  });
});
