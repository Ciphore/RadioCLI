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
  const maxWidth = Math.max(0, length);
  if (displayWidth(value) <= maxWidth) {
    return value;
  }

  if (maxWidth === 0) return '';
  if (maxWidth === 1) return '…';

  let result = '';
  let width = 0;
  for (const grapheme of graphemes(value)) {
    const graphemeWidth = displayWidth(grapheme);
    if (width + graphemeWidth > maxWidth - 1) break;
    result += grapheme;
    width += graphemeWidth;
  }
  return `${result}…`;
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const grapheme of graphemes(value)) {
    if (/^\p{Mark}+$/u.test(grapheme)) continue;
    width += isWideGrapheme(grapheme) ? 2 : 1;
  }
  return width;
}

export function padDisplayEnd(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

export function sliceDisplay(value: string, start: number, length: number): string {
  const safeStart = Math.max(0, Math.floor(start));
  const safeLength = Math.max(0, Math.floor(length));
  if (safeLength === 0) return '';

  let skippedWidth = 0;
  let outputWidth = 0;
  let result = '';
  for (const grapheme of graphemes(value)) {
    const graphemeWidth = displayWidth(grapheme);
    if (skippedWidth + graphemeWidth <= safeStart) {
      skippedWidth += graphemeWidth;
      continue;
    }
    if (outputWidth + graphemeWidth > safeLength) break;
    result += grapheme;
    outputWidth += graphemeWidth;
  }
  return result;
}

export function removeLastGrapheme(value: string): string {
  const parts = graphemes(value);
  parts.pop();
  return parts.join('');
}

function graphemes(value: string): string[] {
  const Segmenter = Intl.Segmenter;
  if (Segmenter) {
    return [...new Segmenter(undefined, {granularity: 'grapheme'}).segment(value)].map(item => item.segment);
  }
  return Array.from(value);
}

function isWideGrapheme(value: string): boolean {
  if (/\p{Extended_Pictographic}/u.test(value)) return true;
  const codePoint = value.codePointAt(0) ?? 0;
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 || codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}
