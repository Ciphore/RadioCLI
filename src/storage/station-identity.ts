import {createHash} from 'node:crypto';
import type {Station} from '../types.js';

/** Paths and signed query parameters are significant: hash the exact target. */
export function customStationId(target: string): string {
  return `custom-v2-${createHash('sha256').update(target).digest('hex')}`;
}

function legacyCustomStationId(target: string): string {
  let hash = 0;
  for (let index = 0; index < target.length; index += 1) hash = (hash * 31 + target.charCodeAt(index)) >>> 0;
  return `custom-${hash.toString(16)}`;
}

/** Only migrate IDs this application generated; preserve user-assigned IDs. */
export function migrateStationIdentity(station: Station): Station {
  if (station.provider !== 'playlist' || !station.streamUrl || station.id !== legacyCustomStationId(station.streamUrl)) return station;
  return {...station, id: customStationId(station.streamUrl), legacyIds: [...new Set([...(station.legacyIds ?? []), station.id])]};
}

export function matchesStationId(station: Station, id: string): boolean {
  const normalized = id.replace(new RegExp(`^${station.provider}:`), '');
  return station.id === normalized || Boolean(station.legacyIds?.includes(normalized));
}
