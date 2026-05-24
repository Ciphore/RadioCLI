import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {themeAccent, themeContributionColors} from '../theme.js';
import {visibleWindow} from '../list-window.js';
import {Menu, Pointer} from '../components/Menu.js';
import {truncate} from '../format.js';

type MapScreenProps = {
  countries: Country[];
  selected: number;
  loading: boolean;
  filter: string;
  editingFilter: boolean;
  theme: ThemeName;
  pageSize: number;
  mode: 'compact' | 'full';
  width: number;
};

type Coordinate = {
  lat: number;
  lon: number;
};

type MapCellKind = 'empty' | 'grid' | 'land' | 'level1' | 'level2' | 'level3' | 'level4' | 'selected';

type MapCell = {
  char: string;
  kind: MapCellKind;
};

type MapRow = {
  cells: MapCell[];
};

const latitudeRange = {min: -55, max: 75};

const countryCoordinates: Record<string, Coordinate> = {
  AD: {lat: 42.5, lon: 1.6},
  AE: {lat: 24.4, lon: 54.3},
  AF: {lat: 33.9, lon: 67.7},
  AG: {lat: 17.1, lon: -61.8},
  AI: {lat: 18.2, lon: -63.1},
  AL: {lat: 41.1, lon: 20.1},
  AM: {lat: 40.1, lon: 45},
  AO: {lat: -11.2, lon: 17.9},
  AR: {lat: -34.6, lon: -64},
  AT: {lat: 47.5, lon: 14.5},
  AU: {lat: -25.3, lon: 133.8},
  AZ: {lat: 40.1, lon: 47.6},
  BA: {lat: 44.2, lon: 17.7},
  BB: {lat: 13.2, lon: -59.5},
  BD: {lat: 23.7, lon: 90.4},
  BE: {lat: 50.8, lon: 4.5},
  BG: {lat: 42.7, lon: 25.5},
  BH: {lat: 26.1, lon: 50.6},
  BM: {lat: 32.3, lon: -64.8},
  BN: {lat: 4.5, lon: 114.7},
  BO: {lat: -16.3, lon: -63.6},
  BR: {lat: -10.8, lon: -53.1},
  BS: {lat: 25, lon: -77.4},
  BY: {lat: 53.7, lon: 27.9},
  BZ: {lat: 17.2, lon: -88.5},
  CA: {lat: 56.1, lon: -106.3},
  CD: {lat: -2.9, lon: 23.7},
  CH: {lat: 46.8, lon: 8.2},
  CL: {lat: -35.7, lon: -71.5},
  CN: {lat: 35.9, lon: 104.2},
  CO: {lat: 4.6, lon: -74.3},
  CR: {lat: 9.7, lon: -84.2},
  CU: {lat: 21.5, lon: -79.5},
  CY: {lat: 35.1, lon: 33.4},
  CZ: {lat: 49.8, lon: 15.5},
  DE: {lat: 51.2, lon: 10.5},
  DK: {lat: 56.3, lon: 9.5},
  DO: {lat: 18.7, lon: -70.2},
  DZ: {lat: 28, lon: 1.7},
  EC: {lat: -1.8, lon: -78.2},
  EE: {lat: 58.6, lon: 25},
  EG: {lat: 26.8, lon: 30.8},
  ES: {lat: 40.5, lon: -3.7},
  FI: {lat: 61.9, lon: 25.7},
  FR: {lat: 46.2, lon: 2.2},
  GB: {lat: 55.4, lon: -3.4},
  GE: {lat: 42.3, lon: 43.4},
  GH: {lat: 7.9, lon: -1},
  GR: {lat: 39.1, lon: 21.8},
  GT: {lat: 15.8, lon: -90.2},
  HK: {lat: 22.3, lon: 114.2},
  HR: {lat: 45.1, lon: 15.2},
  HU: {lat: 47.2, lon: 19.5},
  ID: {lat: -2.5, lon: 118},
  IE: {lat: 53.4, lon: -8.2},
  IL: {lat: 31, lon: 35},
  IN: {lat: 20.6, lon: 78.9},
  IQ: {lat: 33.2, lon: 43.7},
  IR: {lat: 32.4, lon: 53.7},
  IS: {lat: 64.9, lon: -18.6},
  IT: {lat: 42.8, lon: 12.6},
  JM: {lat: 18.1, lon: -77.3},
  JO: {lat: 31.2, lon: 36.2},
  JP: {lat: 36.2, lon: 138.3},
  KE: {lat: -0.1, lon: 37.9},
  KH: {lat: 12.6, lon: 104.9},
  KR: {lat: 36.5, lon: 127.8},
  KW: {lat: 29.3, lon: 47.5},
  KZ: {lat: 48, lon: 67},
  LB: {lat: 33.9, lon: 35.9},
  LK: {lat: 7.9, lon: 80.8},
  LT: {lat: 55.2, lon: 23.9},
  LU: {lat: 49.8, lon: 6.1},
  LV: {lat: 56.9, lon: 24.6},
  MA: {lat: 31.8, lon: -7.1},
  MD: {lat: 47.4, lon: 28.4},
  ME: {lat: 42.7, lon: 19.3},
  MK: {lat: 41.6, lon: 21.7},
  MT: {lat: 35.9, lon: 14.4},
  MX: {lat: 23.6, lon: -102.6},
  MY: {lat: 4.2, lon: 102},
  NG: {lat: 9.1, lon: 8.7},
  NI: {lat: 12.9, lon: -85.2},
  NL: {lat: 52.1, lon: 5.3},
  NO: {lat: 60.5, lon: 8.5},
  NP: {lat: 28.4, lon: 84.1},
  NZ: {lat: -40.9, lon: 174.9},
  PA: {lat: 8.5, lon: -80.8},
  PE: {lat: -9.2, lon: -75},
  PH: {lat: 12.9, lon: 121.8},
  PK: {lat: 30.4, lon: 69.3},
  PL: {lat: 51.9, lon: 19.1},
  PR: {lat: 18.2, lon: -66.6},
  PT: {lat: 39.4, lon: -8.2},
  PY: {lat: -23.4, lon: -58.4},
  QA: {lat: 25.4, lon: 51.2},
  RO: {lat: 45.9, lon: 24.9},
  RS: {lat: 44, lon: 20.9},
  RU: {lat: 61.5, lon: 96},
  SA: {lat: 23.9, lon: 45.1},
  SE: {lat: 60.1, lon: 18.6},
  SG: {lat: 1.4, lon: 103.8},
  SI: {lat: 46.1, lon: 14.9},
  SK: {lat: 48.7, lon: 19.7},
  TH: {lat: 15.9, lon: 101},
  TN: {lat: 34, lon: 9.5},
  TR: {lat: 39, lon: 35.2},
  TW: {lat: 23.7, lon: 121},
  UA: {lat: 48.4, lon: 31.2},
  US: {lat: 39.8, lon: -98.6},
  UY: {lat: -32.5, lon: -55.8},
  VE: {lat: 6.4, lon: -66.6},
  VN: {lat: 14.1, lon: 108.3},
  ZA: {lat: -30.6, lon: 22.9}
};

export function MapScreen({
  countries,
  selected,
  loading,
  filter,
  editingFilter,
  theme,
  pageSize,
  mode,
  width
}: MapScreenProps): React.ReactElement {
  const contentWidth = Math.max(52, width - 2);
  const topCountries = [...countries].sort((a, b) => b.stationCount - a.stationCount).slice(0, mode === 'full' ? 10 : 6);
  const selectedCountry = countries[selected];
  const window = visibleWindow(countries, selected, pageSize);
  const graph = buildWorldMap(countries, selectedCountry, mode, contentWidth);
  const topWidth = mode === 'full' ? 50 : contentWidth;
  const listWidth = Math.max(28, Math.min(contentWidth - topWidth - 4, 56));

  return (
    <Box flexDirection="column">
      <Text bold>World map</Text>
      <Text color={editingFilter ? themeAccent(theme) : 'gray'}>
        {editingFilter ? 'Filtering country list' : 'Station density map by country'}
      </Text>
      <Text>
        Filter: <Text color={themeAccent(theme)}>{filter || 'all'}</Text>
      </Text>
      {loading ? <Text color="gray">Loading country density...</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {graph.rows.map((row, index) => (
          <MapLine key={index} row={row} theme={theme} />
        ))}
      </Box>
      <Text color="gray">
        {graph.plotted} plotted · {graph.unplotted} unplaced · labels show highest station counts
      </Text>
      <Box marginTop={1} flexDirection={mode === 'full' ? 'row' : 'column'}>
        <Box width={topWidth} flexDirection="column">
          <Text color="gray">Highest station counts</Text>
          {topCountries.map(country => (
            <Text key={country.code}>
              <Text color={themeAccent(theme)}>{country.code.padEnd(3)}</Text>
              <Text>{truncate(country.name, 30).padEnd(31)}</Text>
              <Text color="gray">{country.stationCount.toLocaleString().padStart(7)}</Text>
            </Text>
          ))}
        </Box>
        <Box marginLeft={mode === 'full' ? 3 : 0} marginTop={mode === 'full' ? 0 : 1} width={listWidth} flexDirection="column">
          <Text>
            Selected:{' '}
            <Text color={themeAccent(theme)}>
              {selectedCountry ? `${selectedCountry.name} · ${selectedCountry.stationCount.toLocaleString()}` : 'none'}
            </Text>
          </Text>
          <Menu
            items={window.items}
            selected={selected - window.start}
            render={(country, _index, active) => (
              <Box>
                <Pointer active={active} />
                <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                  {country.code}
                </Text>
                <Text color="gray"> · {truncate(country.name, Math.max(8, listWidth - 8))}</Text>
              </Box>
            )}
          />
        </Box>
      </Box>
    </Box>
  );
}

function MapLine({row, theme}: {row: MapRow; theme: ThemeName}): React.ReactElement {
  const chunks: Array<{kind: MapCellKind; text: string}> = [];
  for (const cell of row.cells) {
    const previous = chunks[chunks.length - 1];
    if (previous && previous.kind === cell.kind) {
      previous.text += cell.char;
    } else {
      chunks.push({kind: cell.kind, text: cell.char});
    }
  }

  return (
    <Box>
      {chunks.map((chunk, index) => (
        <Text key={index} color={mapColor(chunk.kind, theme)}>
          {chunk.text}
        </Text>
      ))}
    </Box>
  );
}

export function buildWorldMap(
  countries: Country[],
  selectedCountry: Country | undefined,
  mode: 'compact' | 'full',
  width: number
): {rows: MapRow[]; plotted: number; unplotted: number} {
  const mapWidth = Math.max(mode === 'full' ? 84 : 56, Math.min(mode === 'full' ? 124 : 72, width));
  const mapHeight = mode === 'full' ? 14 : 9;
  const grid = Array.from({length: mapHeight}, (_, y) =>
    Array.from({length: mapWidth}, (_, x): MapCell => ({
      char: baseMapChar(x, y, mapWidth, mapHeight),
      kind: baseMapKind(x, y, mapWidth, mapHeight)
    }))
  );
  const knownCountries = countries.filter(country => countryCoordinates[country.code]);
  const stationCounts = knownCountries.map(country => country.stationCount);
  const maxStations = Math.max(1, ...stationCounts);
  const labeledCountries = new Set(
    [...knownCountries]
      .sort((a, b) => b.stationCount - a.stationCount)
      .slice(0, mode === 'full' ? 34 : 18)
      .map(country => country.code)
  );

  if (selectedCountry?.code && countryCoordinates[selectedCountry.code]) {
    labeledCountries.add(selectedCountry.code);
  }

  for (const country of knownCountries) {
    const coordinate = countryCoordinates[country.code]!;
    const projected = projectCoordinate(coordinate, mapWidth, mapHeight);
    const level = densityLevel(country.stationCount, maxStations);
    if (labeledCountries.has(country.code)) {
      placeCountryLabel(grid, country.code, projected.x, projected.y, country === selectedCountry, level);
    } else {
      placeCountryDot(grid, projected.x, projected.y, level);
    }
  }

  return {
    rows: grid.map(cells => ({cells})),
    plotted: knownCountries.length,
    unplotted: Math.max(0, countries.length - knownCountries.length)
  };
}

function baseMapChar(x: number, y: number, width: number, height: number): string {
  const coordinate = unprojectCoordinate(x, y, width, height);
  if (isApproximateLand(coordinate.lat, coordinate.lon)) {
    return '·';
  }

  if (x % Math.max(10, Math.round(width / 8)) === 0 || y === Math.floor(height * 0.42)) {
    return '·';
  }

  return ' ';
}

function baseMapKind(x: number, y: number, width: number, height: number): MapCellKind {
  const coordinate = unprojectCoordinate(x, y, width, height);
  return isApproximateLand(coordinate.lat, coordinate.lon) ? 'land' : 'grid';
}

function projectCoordinate(coordinate: Coordinate, width: number, height: number): {x: number; y: number} {
  const lon = Math.max(-180, Math.min(180, coordinate.lon));
  const lat = Math.max(latitudeRange.min, Math.min(latitudeRange.max, coordinate.lat));
  return {
    x: Math.round(((lon + 180) / 360) * (width - 1)),
    y: Math.round(((latitudeRange.max - lat) / (latitudeRange.max - latitudeRange.min)) * (height - 1))
  };
}

function unprojectCoordinate(x: number, y: number, width: number, height: number): Coordinate {
  return {
    lon: (x / Math.max(1, width - 1)) * 360 - 180,
    lat: latitudeRange.max - (y / Math.max(1, height - 1)) * (latitudeRange.max - latitudeRange.min)
  };
}

function placeCountryLabel(grid: MapCell[][], code: string, x: number, y: number, selected: boolean, level: number): void {
  const label = code.slice(0, 2).toUpperCase();
  const offsets = [
    {x: 0, y: 0},
    {x: 1, y: 0},
    {x: -2, y: 0},
    {x: 0, y: -1},
    {x: 0, y: 1},
    {x: 2, y: -1},
    {x: -3, y: 1},
    {x: 2, y: 1},
    {x: -3, y: -1}
  ];
  const kind = selected ? 'selected' : levelKind(level);

  for (const offset of offsets) {
    const startX = x + offset.x;
    const labelY = y + offset.y;
    if (canPlaceLabel(grid, label, startX, labelY)) {
      for (let index = 0; index < label.length; index += 1) {
        grid[labelY]![startX + index] = {char: label[index]!, kind};
      }
      return;
    }
  }

  placeCountryDot(grid, x, y, level);
}

function canPlaceLabel(grid: MapCell[][], label: string, x: number, y: number): boolean {
  const width = grid[0]?.length ?? 0;
  if (y < 0 || y >= grid.length || x < 0 || x + label.length > width) {
    return false;
  }

  for (let index = 0; index < label.length; index += 1) {
    const kind = grid[y]![x + index]!.kind;
    if (kind !== 'empty' && kind !== 'grid' && kind !== 'land') {
      return false;
    }
  }

  return true;
}

function placeCountryDot(grid: MapCell[][], x: number, y: number, level: number): void {
  if (y < 0 || y >= grid.length || x < 0 || x >= (grid[0]?.length ?? 0)) {
    return;
  }

  const existing = grid[y]![x]!;
  if (existing.kind === 'selected') {
    return;
  }

  grid[y]![x] = {
    char: level >= 4 ? '●' : level >= 3 ? '•' : '·',
    kind: levelKind(level)
  };
}

function densityLevel(stationCount: number, maxStations: number): number {
  const ratio = stationCount / Math.max(1, maxStations);
  if (ratio >= 0.7) {
    return 4;
  }

  if (ratio >= 0.35) {
    return 3;
  }

  if (ratio >= 0.12) {
    return 2;
  }

  return 1;
}

function levelKind(level: number): MapCellKind {
  if (level >= 4) {
    return 'level4';
  }

  if (level >= 3) {
    return 'level3';
  }

  if (level >= 2) {
    return 'level2';
  }

  return 'level1';
}

function mapColor(kind: MapCellKind, theme: ThemeName): string {
  const colors = themeContributionColors(theme);
  if (kind === 'selected') {
    return themeAccent(theme);
  }

  if (kind === 'level4') {
    return colors[4] ?? themeAccent(theme);
  }

  if (kind === 'level3') {
    return colors[3] ?? themeAccent(theme);
  }

  if (kind === 'level2') {
    return colors[2] ?? themeAccent(theme);
  }

  if (kind === 'level1') {
    return colors[1] ?? 'gray';
  }

  if (kind === 'land') {
    return '#33414f';
  }

  return '#1a2430';
}

function isApproximateLand(lat: number, lon: number): boolean {
  return (
    ellipse(lat, lon, 50, -110, 30, 62) ||
    ellipse(lat, lon, 18, -92, 14, 28) ||
    ellipse(lat, lon, -19, -61, 36, 21) ||
    ellipse(lat, lon, 54, -42, 12, 22) ||
    ellipse(lat, lon, 49, 15, 18, 28) ||
    ellipse(lat, lon, 47, 78, 31, 88) ||
    ellipse(lat, lon, 12, 20, 38, 30) ||
    ellipse(lat, lon, 21, 78, 16, 28) ||
    ellipse(lat, lon, 6, 115, 18, 30) ||
    ellipse(lat, lon, -25, 134, 15, 26) ||
    ellipse(lat, lon, -41, 173, 6, 9)
  );
}

function ellipse(lat: number, lon: number, centerLat: number, centerLon: number, radiusLat: number, radiusLon: number): boolean {
  const dy = (lat - centerLat) / radiusLat;
  const dx = (lon - centerLon) / radiusLon;
  return dx * dx + dy * dy <= 1;
}
