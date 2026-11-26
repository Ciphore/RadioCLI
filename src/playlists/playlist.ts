import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Station} from '../types.js';
import {customStationId} from '../storage/station-identity.js';

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
    stations = parseXspf(text, filePath);
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
    id: customStationId(url),
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

function parseXspf(text: string, filePath: string): Station[] {
  // XSPF locations are URI references. Carry namespace and xml:base context
  // through the document, including prefixed playlists and location elements.
  // No DTD/entity declarations are interpreted or fetched.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XSPF entity declarations are unsupported.');
  type Element = {name: string; local: string; xspf: boolean; base: URL; namespaces: Record<string, string>; text: string};
  const stack: Element[] = [];
  const stations: Station[] = [];
  let track: {title?: string; locations: string[]} | undefined;
  const tokens = text.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[^<>"']|"[^"]*"|'[^']*')+>|[^<]+/g) ?? [];
  const close = () => {
    const element = stack.pop();
    if (!element) throw new Error('Invalid XSPF element nesting.');
    if (track && element.xspf && stack.at(-1)?.local === 'track') {
      if (element.local === 'title') track.title = element.text.trim();
      if (element.local === 'location' && element.text.trim()) {
        try {
          const target = new URL(element.text.trim(), element.base).href;
          if (isSupportedTarget(target)) track.locations.push(target);
        } catch { /* An invalid location does not discard other tracks. */ }
      }
    }
    if (element.xspf && element.local === 'track' && track) {
      const location = track.locations[0];
      if (location) stations.push(stationFromUrl(location, track.title || location));
      track = undefined;
    }
  };
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) { if (stack.length) stack.at(-1)!.text += token.slice(9, -3); continue; }
    if (!token.startsWith('<')) { if (stack.length) stack.at(-1)!.text += decodeXml(token) ?? ''; continue; }
    if (token.startsWith('</')) {
      if (stack.at(-1)?.name !== token.slice(2, -1).trim()) throw new Error('Invalid XSPF element nesting.');
      close(); continue;
    }
    const name = /^<([\w:.-]+)/.exec(token)?.[1];
    if (!name) throw new Error('Invalid XSPF element.');
    const attributes = Object.fromEntries([...token.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(match => [match[1]!, decodeXml(match[3]) ?? '']));
    const parent = stack.at(-1);
    const namespaces = {...parent?.namespaces};
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'xmlns') namespaces[''] = value;
      else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
    }
    const parts = name.split(':'); const local = parts.at(-1)!;
    const namespace = namespaces[parts.length === 1 ? '' : parts[0]!];
    const xspf = namespace === 'http://xspf.org/ns/0/' || parts.length === 1 && namespace === undefined;
    const base = new URL(attributes['xml:base'] ?? '', parent?.base ?? pathToFileURL(resolve(filePath)));
    stack.push({name, local, xspf, base, namespaces, text: ''});
    if (xspf && local === 'track' && parent?.xspf && parent.local === 'trackList') track = {locations: []};
    if (token.endsWith('/>')) close();
  }
  if (stack.length) throw new Error('Invalid XSPF element nesting.');
  return stations;
}

function decodeXml(value?: string): string | undefined {
  // Decode in one pass: CDATA is literal text, and &amp;lt; represents &lt;,
  // not a second reference to expand. No DTD or external entity is evaluated.
  const entities: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
  return value?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,
    (reference: string, cdata: string | undefined, entity: string | undefined) => {
      if (cdata !== undefined) return cdata;
      if (!entity) return reference;
      if (!entity.startsWith('#')) return entities[entity] ?? reference;
      const point = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : reference;
    });
}

function normalizePlaylistTarget(target: string, root: string): string | null {
  const trimmed = target.trim();
  if (isSupportedTarget(trimmed)) {
    return trimmed;
  }

  // On Windows a native drive path has a colon but is not a URL scheme.
  if (isAbsolute(trimmed) || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
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
