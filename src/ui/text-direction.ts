import {rightToLeftPattern, strongDirectionPattern} from './bidi-ranges.js';

/** First-strong direction for single-line text sanitized by sanitizeTerminalText. */
export function textDirection(text: string): 'ltr' | 'rtl' {
  // UAX #9 P2/P3: numbers, combining marks, emoji and punctuation generally
  // don't establish direction. Inspect the whole name, never the moving slice.
  // Pinned bidi classes avoid relying on locale or the host's ICU version.
  const first = strongDirectionPattern.exec(text)?.[0];
  return first && rightToLeftPattern.test(first) ? 'rtl' : 'ltr';
}
