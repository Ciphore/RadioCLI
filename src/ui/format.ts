import type {Station} from '../types.js';

export function stationLocation(station: Station): string {
  return [station.city, station.state, station.country].filter(Boolean).join(', ') || station.countryCode || 'Unknown origin';
}

export function stationTech(station: Station): string {
  const parts = [
    station.codec,
    station.bitrate ? `${station.bitrate} kbps` : undefined,
    station.hls ? 'HLS' : undefined,
    station.language,
    station.distanceKm !== undefined ? `${Math.round(station.distanceKm)} km` : undefined
  ].filter(Boolean);

  return parts.join(' / ') || 'Live stream';
}

export function stationTags(station: Station): string {
  return station.tags.slice(0, 4).join(', ') || 'general';
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 1))}…`;
}
