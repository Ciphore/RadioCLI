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

  // Diagonal box strokes need to retain their direction for wireframes,
  // routes, folds, and other receiver geometry.
  if (code === 0x2571) {
    return '/';
  }

  if (code === 0x2572) {
    return '\\';
  }

  if (code === 0x2573) {
    return 'X';
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

  if (code === 0x25c9 || code === 0x25d2) {
    return 'o'; // ◉ ◒
  }

  if (code === 0x2218) return 'o'; // ring operator used by receiver patterns
  if (code === 0x25c6 || code === 0x25c7) return '*'; // decorative diamonds
  if (code === 0x201c || code === 0x201d) return '"';
  if (code === 0x2018 || code === 0x2019) return "'";

  if (code === 0x25b2) {
    return '^'; // ▲
  }

  if (code === 0x25bc) {
    return 'v'; // ▼
  }

  if (code === 0x25e2 || code === 0x25e5) {
    return '/'; // ◢ ◥
  }

  if (code === 0x25e3 || code === 0x25e4) {
    return '\\'; // ◣ ◤
  }

  if (code === 0x22d6) {
    return '<'; // ⋖
  }

  if (code === 0x22d7) {
    return '>'; // ⋗
  }

  if (code === 0x2301) {
    return '~'; // ⌁
  }

  if (code === 0x02d9) {
    return '.'; // ˙
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

  if (code === 0x203a || code === 0x2192) return '>';
  if (code === 0x2039 || code === 0x2190) return '<';
  if (code === 0x2191) return '^';
  if (code === 0x2193) return 'v';

  // Drop invisible separators, but retain combining accents in station data.
  // Width measurement already accounts for combining marks as zero columns.
  if (code === 0x200b || code === 0xfeff) {
    return '';
  }

  // Unknown Unicode is user/content data more often than decoration. Preserve
  // it instead of destroying international station names; known terminal-art
  // ranges above still receive ASCII fallbacks.
  return String.fromCodePoint(code);
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
