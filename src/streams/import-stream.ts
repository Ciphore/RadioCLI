import type {Station} from '../types.js';
import {withExternalResponse} from '../platform/network.js';
import {safeExternalHttpUrl, sanitizeTerminalText} from '../safety.js';
import {stationFromUrl} from '../playlists/playlist.js';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type StreamImportResult = {
  station: Station;
  identified: boolean;
  warning?: string;
};

export type StreamImportOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

type StreamHeaders = {
  name?: string;
  homepage?: string;
  codec?: string;
  bitrate?: number;
  hls?: boolean;
};

class DefiniteStreamError extends Error {}

/**
 * Build a custom station and enrich it from bounded HTTP/ICY response headers.
 * The submitted URL is intentionally retained because a followed redirect may
 * contain a short-lived playback token.
 */
export async function importStreamUrl(
  input: string,
  requestedName?: string,
  options: StreamImportOptions = {}
): Promise<StreamImportResult> {
  const url = validatedStreamUrl(input);
  const explicitName = sanitizeTerminalText(requestedName);

  try {
    let metadata = await probeStreamHeaders(url, options);
    const listing = await probeIHeartListing(url, options).catch(() => undefined);
    if (listing) metadata = {...metadata, ...listing};
    const name = explicitName ?? metadata.name ?? fallbackStationName(url);
    return {
      station: {
        ...stationFromUrl(url, name),
        ...(metadata.homepage ? {homepage: metadata.homepage} : {}),
        ...(metadata.codec ? {codec: metadata.codec} : {}),
        ...(metadata.bitrate ? {bitrate: metadata.bitrate} : {}),
        ...(metadata.hls !== undefined ? {hls: metadata.hls} : {})
      },
      identified: Boolean(metadata.name),
      ...(!metadata.name && !explicitName
        ? {warning: `The stream did not publish a station name; saved as ${name}.`}
        : {})
    };
  } catch (error) {
    if (error instanceof DefiniteStreamError) throw error;
    const name = explicitName ?? fallbackStationName(url);
    return {
      station: stationFromUrl(url, name),
      identified: false,
      warning: `Could not read stream metadata; saved as ${name}.`
    };
  }
}

async function probeStreamHeaders(url: string, options: StreamImportOptions): Promise<StreamHeaders> {
  return withExternalResponse(
    url,
    {
      timeoutMs: options.timeoutMs ?? 7_000,
      fetchImpl: options.fetchImpl,
      init: {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: 'audio/*, application/ogg, application/vnd.apple.mpegurl, application/x-mpegurl, */*;q=0.1',
          'icy-metadata': '1'
        }
      }
    },
    response => {
      if (!response.ok) {
        throw new DefiniteStreamError(`The stream returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (contentType === 'text/html' || contentType === 'application/json') {
        throw new DefiniteStreamError('That URL points to a webpage or API response, not a direct radio stream.');
      }

      const icyName = sanitizeTerminalText(response.headers.get('icy-name'));
      const icyDescription = sanitizeTerminalText(response.headers.get('icy-description'));
      const homepage = safeOptionalHttpUrl(response.headers.get('icy-url'));
      const bitrate = parseBitrate(response.headers.get('icy-br'), response.headers.get('icy-audio-info'));
      const codec = codecFromContentType(contentType);
      const hls = isHls(contentType, url);

      return {
        ...(icyName || icyDescription ? {name: icyName ?? icyDescription} : {}),
        ...(homepage ? {homepage} : {}),
        ...(codec ? {codec} : {}),
        ...(bitrate ? {bitrate} : {}),
        ...(hls ? {hls: true} : {})
      };
    }
  );
}

/** iHeart stream headers are sometimes unnamed, but their stable numeric stream
 * id resolves to a canonical public station path without downloading the page. */
async function probeIHeartListing(url: string, options: StreamImportOptions): Promise<StreamHeaders | undefined> {
  const parsed = new URL(url);
  if (!/(?:^|\.)ihrhls\.com$/i.test(parsed.hostname)) return undefined;
  const stationId = /\/zc(\d+)(?:\/|$)/i.exec(parsed.pathname)?.[1]
    ?? /\/(\d+)_icy(?:\/|$)/i.exec(parsed.pathname)?.[1];
  if (!stationId) return undefined;

  return withExternalResponse(
    `https://www.iheart.com/live/${stationId}/`,
    {
      timeoutMs: Math.min(options.timeoutMs ?? 7_000, 4_000),
      fetchImpl: options.fetchImpl,
      init: {method: 'HEAD', redirect: 'manual'}
    },
    response => {
      const location = response.headers.get('location');
      const slug = location && new RegExp(`^/live/(.+)-${stationId}/?$`, 'i').exec(location)?.[1];
      if (!slug) return undefined;
      const name = stationNameFromSlug(slug);
      return name ? {name, homepage: `https://www.iheart.com${location}`} : undefined;
    }
  );
}

function validatedStreamUrl(input: string): string {
  const cleaned = safeExternalHttpUrl(input);
  if (!cleaned) throw new Error('Import requires a direct HTTP(S) stream URL.');
  const parsed = new URL(cleaned);
  if (parsed.username || parsed.password) throw new Error('Stream URLs containing credentials are not supported.');
  return cleaned;
}

function safeOptionalHttpUrl(input: string | null): string | undefined {
  return input ? safeExternalHttpUrl(input) ?? undefined : undefined;
}

function parseBitrate(icyBitrate: string | null, audioInfo: string | null): number | undefined {
  const raw = icyBitrate?.match(/\d+/)?.[0] ?? audioInfo?.match(/(?:^|;)\s*bitrate=(\d+)/i)?.[1];
  const bitrate = Number(raw);
  return Number.isFinite(bitrate) && bitrate > 0 ? bitrate : undefined;
}

function codecFromContentType(contentType?: string): string | undefined {
  if (!contentType) return undefined;
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return 'MP3';
  if (contentType === 'audio/aac' || contentType === 'audio/aacp') return 'AAC';
  if (contentType === 'audio/ogg' || contentType === 'application/ogg') return 'OGG';
  if (contentType === 'audio/flac' || contentType === 'audio/x-flac') return 'FLAC';
  if (contentType.includes('mpegurl')) return 'HLS';
  return undefined;
}

function isHls(contentType: string | undefined, url: string): boolean {
  return Boolean(contentType?.includes('mpegurl') || /\.m3u8(?:$|[?#])/i.test(url));
}

function fallbackStationName(url: string): string {
  const parsed = new URL(url);
  const segment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '')
    .replace(/\.(?:aac|flac|m3u8?|mp3|ogg|opus)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return sanitizeTerminalText(segment) ?? parsed.hostname.replace(/^www\./i, '');
}

function stationNameFromSlug(slug: string): string | undefined {
  const tokens = slug.split('-').filter(Boolean);
  const final = tokens.at(-1);
  const previous = tokens.at(-2);
  if (final && previous && /^\d$/.test(final) && /^\d{2,3}$/.test(previous)) {
    tokens.splice(-2, 2, `${previous}.${final}`);
  }
  return sanitizeTerminalText(tokens.map(token => {
    if (/^(?:am|fm|hd\d*)$/i.test(token)) return token.toUpperCase();
    if (/^jamn$/i.test(token)) return "JAM'N";
    if (/^\d{3,4}$/.test(token) && Number(token) >= 881 && Number(token) <= 1079) {
      return `${token.slice(0, -1)}.${token.slice(-1)}`;
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
  }).join(' '));
}
