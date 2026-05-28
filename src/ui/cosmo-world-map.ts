import type {Station} from '../types.js';
import {cosmoLandPolygons} from './cosmo-land-data.js';

// Adapted from irahulstomar/cosmo-tui's MIT-licensed braille world map renderer.
// It keeps the same Natural Earth point-in-polygon rasterization and 2x4 braille cells.
type Coordinate = {
  lat: number;
  lon: number;
};

export type CosmoMapCellKind = 'sea' | 'land' | 'marker' | 'selected';

type CosmoMapCell = {
  char: string;
  kind: CosmoMapCellKind;
};

export type CosmoMapRow = {
  cells: CosmoMapCell[];
};

type CosmoMapMarker = Coordinate & {
  selected?: boolean;
};

const brailleBase = 0x2800;
const brailleBlank = String.fromCharCode(brailleBase);
const maxMapCacheEntries = 4;
const brailleBits: Array<[number, number, number]> = [
  [0, 0, 0x01],
  [1, 0, 0x02],
  [2, 0, 0x04],
  [3, 0, 0x40],
  [0, 1, 0x08],
  [1, 1, 0x10],
  [2, 1, 0x20],
  [3, 1, 0x80]
];
const mapCache = new Map<string, string[]>();

export function buildCosmoWorldMap(width: number, height: number, markers: CosmoMapMarker[] = []): CosmoMapRow[] {
  const mapWidth = Math.max(40, Math.floor(width));
  const mapHeight = Math.max(10, Math.floor(height));
  const rows = buildCosmoMapRows(mapWidth, mapHeight);
  const cells: CosmoMapCell[][] = rows.map(row =>
    Array.from(row, char => ({
      char: char === brailleBlank ? ' ' : char,
      kind: char === brailleBlank ? 'sea' : 'land'
    }))
  );

  for (const marker of markers) {
    const projected = projectCosmoCoordinate(marker, mapWidth, mapHeight);
    cells[projected.row]![projected.col] = {
      char: marker.selected ? '●' : '•',
      kind: marker.selected ? 'selected' : 'marker'
    };
  }

  return cells.map(row => ({cells: row}));
}

export function stationMapMarkers(stations: Station[], selected: number, limit = 180): CosmoMapMarker[] {
  const markers: CosmoMapMarker[] = [];
  const seen = new Set<string>();
  const selectedStation = stations[selected];
  const markerStations = stations.slice(0, limit);

  if (selectedStation && selected >= limit) {
    markerStations.push(selectedStation);
  }

  markerStations.forEach(station => {
    const coordinate = stationCoordinate(station);
    if (!coordinate) {
      return;
    }

    const key = `${coordinate.lat.toFixed(2)},${coordinate.lon.toFixed(2)}`;
    const selectedMarker = station === selectedStation;
    if (seen.has(key) && !selectedMarker) {
      return;
    }

    seen.add(key);
    markers.push({...coordinate, selected: selectedMarker});
  });

  return markers;
}

function buildCosmoMapRows(width: number, height: number): string[] {
  const cacheKey = `${width}x${height}`;
  const cached = mapCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pixelWidth = width * 2;
  const pixelHeight = height * 4;
  const mask: boolean[][] = [];

  for (let py = 0; py < pixelHeight; py += 1) {
    const lat = 90 - ((py + 0.5) / pixelHeight) * 180;
    const row: boolean[] = [];

    for (let px = 0; px < pixelWidth; px += 1) {
      const lon = -180 + ((px + 0.5) / pixelWidth) * 360;
      row.push(isCosmoLand(lat, lon));
    }

    mask.push(row);
  }

  const rows: string[] = [];
  for (let cy = 0; cy < height; cy += 1) {
    let row = '';
    for (let cx = 0; cx < width; cx += 1) {
      let bits = 0;
      for (const [sr, sc, bit] of brailleBits) {
        if (mask[cy * 4 + sr]?.[cx * 2 + sc]) {
          bits |= bit;
        }
      }

      row += String.fromCharCode(brailleBase + bits);
    }
    rows.push(row);
  }

  mapCache.set(cacheKey, rows);
  if (mapCache.size > maxMapCacheEntries) {
    const oldestKey = mapCache.keys().next().value;
    if (oldestKey) {
      mapCache.delete(oldestKey);
    }
  }

  return rows;
}

function isCosmoLand(lat: number, lon: number): boolean {
  for (const [bbox, rings] of cosmoLandPolygons) {
    const [minX, minY, maxX, maxY] = bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) {
      continue;
    }

    const [outer, ...holes] = rings;
    if (!outer || !pointInRing(lon, lat, outer)) {
      continue;
    }

    if (holes.some(hole => pointInRing(lon, lat, hole))) {
      continue;
    }

    return true;
  }

  return false;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  let previous = ring.length - 1;

  for (let current = 0; current < ring.length; current += 1) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) {
      previous = current;
      continue;
    }

    const [currentLon = 0, currentLat = 0] = currentPoint;
    const [previousLon = 0, previousLat = 0] = previousPoint;
    if ((currentLat > lat) !== (previousLat > lat) && lon < ((previousLon - currentLon) * (lat - currentLat)) / (previousLat - currentLat + 1e-12) + currentLon) {
      inside = !inside;
    }
    previous = current;
  }

  return inside;
}

function projectCosmoCoordinate(coordinate: Coordinate, width: number, height: number): {col: number; row: number} {
  const col = Math.max(0, Math.min(width - 1, Math.floor(((coordinate.lon + 180) / 360) * width)));
  const row = Math.max(0, Math.min(height - 1, Math.floor(((90 - coordinate.lat) / 180) * height)));

  return {col, row};
}

function stationCoordinate(station: Station): Coordinate | null {
  if (
    typeof station.latitude === 'number' &&
    Number.isFinite(station.latitude) &&
    typeof station.longitude === 'number' &&
    Number.isFinite(station.longitude)
  ) {
    return {lat: station.latitude, lon: station.longitude};
  }

  return null;
}
