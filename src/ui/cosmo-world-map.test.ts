import {describe, expect, it} from 'vitest';
import type {Station} from '../types.js';
import {buildCosmoWorldMap, stationMapMarkers} from './cosmo-world-map.js';

describe('buildCosmoWorldMap', () => {
  it('renders a braille Natural Earth world map with selected markers', () => {
    const rows = buildCosmoWorldMap(92, 24, [
      {lat: 40.7128, lon: -74.006, selected: true},
      {lat: 51.5072, lon: -0.1276}
    ]);
    const text = rows.map(row => row.cells.map(cell => cell.char).join('')).join('\n');

    expect(rows).toHaveLength(24);
    expect(rows[0]?.cells).toHaveLength(92);
    expect(text).toMatch(/[⠁-⣿]/);
    expect(text).toContain('●');
    expect(text).toContain('•');
  });
});

describe('stationMapMarkers', () => {
  it('uses station coordinates and keeps the selected station visible beyond the marker limit', () => {
    const stations: Station[] = Array.from({length: 4}, (_, index) => ({
      id: `station-${index}`,
      provider: 'radio-browser',
      name: `Station ${index}`,
      tags: [],
      latitude: index,
      longitude: index
    }));

    const markers = stationMapMarkers(stations, 3, 2);

    expect(markers).toHaveLength(3);
    expect(markers.at(-1)).toMatchObject({lat: 3, lon: 3, selected: true});
  });
});
