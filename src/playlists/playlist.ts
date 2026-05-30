import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import type {Station} from '../types.js';

export function parsePlaylistFile(filePath: string, depth = 0): Station[] {
  if (!existsSync(filePath)) {
    throw new Error(`Playlist not found: ${filePath}`);
  }

  const text = readFileSync(filePath, 'utf8');
  const root = dirname(filePath);
  const lower = filePath.toLowerCase();
  let stations: Station[];
  if (lower.endsWith('.pls')) {
    stations = parsePls(text, root, depth);
  } else if (lower.endsWith('.xspf')) {
    stations = parseXspf(text);
  } else {
    stations = parseM3u(text, basename(filePath), root, depth);
  }
  return dedupeStations(stations);
}

export function writeM3u(filePath: string, stations: Station[]): void {
  const lines = ['#EXTM3U'];
  for (const station of stations) {
    const url = station.streamUrl;
    if (!url) {
      continue;
    }

    lines.push(`#EXTINF:-1,${station.name}`);
    lines.push(url);
  }

  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export function stationFromUrl(url: string, name = url): Station {
  const cleanedName = cleanName(name) || url;
  return {
    id: stableId(url),
    provider: 'playlist',
    name: cleanedName,
    tags: ['custom'],
    streamUrl: url
  };
}

function parseM3u(text: string, fallbackName: string, root: string, depth: number): Station[] {
  const stations: Station[] = [];
  let pendingName: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      pendingName = line.split(',').slice(1).join(',').trim() || undefined;
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const nestedPath = nestedPlaylistPath(line, root);
    if (nestedPath && depth < 2) {
      stations.push(...parsePlaylistFile(nestedPath, depth + 1));
      pendingName = undefined;
      continue;
    }

    const url = normalizePlaylistTarget(line, root);
    if (url) {
      stations.push(stationFromUrl(url, pendingName ?? fallbackName));
      pendingName = undefined;
    }
  }

  return stations;
}

function parsePls(text: string, root: string, depth: number): Station[] {
  const files = new Map<number, string>();
  const titles = new Map<number, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^(File|Title)(\d+)=(.*)$/i.exec(line);
    if (!match) {
      continue;
    }

    const index = Number(match[2]);
    if (match[1]?.toLowerCase() === 'file') {
      files.set(index, match[3] ?? '');
    } else {
      titles.set(index, match[3] ?? '');
    }
  }

  return [...files.entries()].flatMap(([index, target]) => {
    const nestedPath = nestedPlaylistPath(target, root);
    if (nestedPath && depth < 2) {
      return parsePlaylistFile(nestedPath, depth + 1);
    }

    const url = normalizePlaylistTarget(target, root);
    return url ? [stationFromUrl(url, titles.get(index) || url)] : [];
  });
}

function parseXspf(text: string): Station[] {
  const tracks = [...text.matchAll(/<track\b[\s\S]*?<\/track>/gi)].map(match => match[0]);
  return tracks.flatMap(track => {
    const location = decodeXml(firstTag(track, 'location'));
    if (!location || !isSupportedTarget(location)) {
      return [];
    }

    return [stationFromUrl(location, decodeXml(firstTag(track, 'title')) || location)];
  });
}

function firstTag(text: string, tag: string): string | undefined {
  return new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(text)?.[1]?.trim();
}

function decodeXml(value?: string): string | undefined {
  return value
    ?.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return `custom-${hash.toString(16)}`;
}

function normalizePlaylistTarget(target: string, root: string): string | null {
  const trimmed = target.trim();
  if (isSupportedTarget(trimmed)) {
    return trimmed;
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const filePath = isAbsolute(trimmed) ? trimmed : resolve(root, trimmed);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

function nestedPlaylistPath(target: string, root: string): string | null {
  const trimmed = target.trim();
  if (!/\.(m3u8?|pls|xspf)$/i.test(trimmed)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const filePath = isAbsolute(trimmed) ? trimmed : join(root, trimmed);
  return existsSync(filePath) ? filePath : null;
}

function isSupportedTarget(target: string): boolean {
  return /^(https?|file):\/\//i.test(target);
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function dedupeStations(stations: Station[]): Station[] {
  const seen = new Set<string>();
  const deduped: Station[] = [];
  for (const station of stations) {
    if (!station.streamUrl || seen.has(station.streamUrl)) {
      continue;
    }

    seen.add(station.streamUrl);
    deduped.push(station);
  }

  return deduped;
}
