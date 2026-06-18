import {describe, expect, it} from 'vitest';
import {toAsciiSafe} from './ascii.js';

describe('toAsciiSafe', () => {
  it('leaves plain ASCII untouched', () => {
    expect(toAsciiSafe('KEXP 90.3 FM')).toBe('KEXP 90.3 FM');
  });

  it('maps box-drawing characters to ASCII equivalents', () => {
    expect(toAsciiSafe('┌──┐')).toBe('+--+');
    expect(toAsciiSafe('│ x │')).toBe('| x |');
    expect(toAsciiSafe('└──┘')).toBe('+--+');
  });

  it('maps braille and block glyphs to a density ramp without changing width', () => {
    const braille = '⠀⠿█';
    const result = toAsciiSafe(braille);
    expect(result).toHaveLength(braille.length);
    expect(result[0]).toBe(' ');
    expect(result.endsWith('#')).toBe(true);
  });

  it('maps favorite stars to ASCII marks', () => {
    expect(toAsciiSafe('★ Favorite')).toBe('* Favorite');
    expect(toAsciiSafe('☆ Favorite')).toBe('o Favorite');
  });

  it('maps density and separator marks to a low-to-high ASCII ramp', () => {
    expect(toAsciiSafe('·•●')).toBe('.o@');
    expect(toAsciiSafe('a · b')).toBe('a . b');
    expect(toAsciiSafe('Loading…')).toBe('Loading.');
  });
});
