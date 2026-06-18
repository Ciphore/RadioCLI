// Map a single Unicode code point to a width-1 ASCII approximation. Used by the
// ASCII-safe display mode so terminals/fonts without braille, block, or
// box-drawing glyphs still render a legible receiver and chrome.
const shadeRamp = ' .:-=+*#%@';

function asciiGlyph(code: number): string {
  // Braille patterns: approximate by how many dots are raised (0-8).
  if (code >= 0x2800 && code <= 0x28ff) {
    const dots = popcount(code - 0x2800);
    const index = Math.round((dots / 8) * (shadeRamp.length - 1));
    return shadeRamp[index] ?? '#';
  }

  // Light/medium/dark shade blocks.
  if (code === 0x2591) {
    return '.';
  }

  if (code === 0x2592) {
    return ':';
  }

  if (code === 0x2593) {
    return '#';
  }

  // Block elements (full, partial, half blocks).
  if (code >= 0x2580 && code <= 0x259f) {
    return '#';
  }

  // Box drawing.
  if (code >= 0x2500 && code <= 0x257f) {
    if (code === 0x2500 || code === 0x2501 || code === 0x2504 || code === 0x2505) {
      return '-';
    }

    if (code === 0x2502 || code === 0x2503 || code === 0x2506 || code === 0x2507) {
      return '|';
    }

    return '+';
  }

  // Common standalone marks.
  // Density-style marks: keep a low-to-high ramp so map textures stay legible.
  if (code === 0x00b7) {
    return '.'; // middle dot ·
  }

  if (code === 0x2026) {
    return '.'; // ellipsis …
  }

  if (code === 0x2022) {
    return 'o'; // bullet •
  }

  if (code === 0x25cf) {
    return '@'; // black circle ●
  }

  if (code === 0x25cb || code === 0x25aa || code === 0x25a0) {
    return '*';
  }

  if (code === 0x2605) {
    return '*'; // ★
  }

  if (code === 0x2606) {
    return 'o'; // ☆
  }

  if (code === 0x2014 || code === 0x2013) {
    return '-';
  }

  // Drop zero-width and combining marks entirely so they do not skew widths.
  if (code === 0x200b || code === 0xfeff || (code >= 0x0300 && code <= 0x036f)) {
    return '';
  }

  return '*';
}

function popcount(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }

  return count;
}

export function toAsciiSafe(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x80 ? char : asciiGlyph(code);
  }

  return out;
}
