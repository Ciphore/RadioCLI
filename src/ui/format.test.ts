import {describe, expect, it} from 'vitest';
import {displayWidth, padDisplayEnd, removeLastGrapheme, sliceDisplay, truncate} from './format.js';

describe('terminal display formatting', () => {
  it('measures CJK and emoji graphemes as double-width terminal cells', () => {
    expect(displayWidth('FM 東京 📻')).toBe(10);
    expect(padDisplayEnd('東京', 6)).toBe('東京  ');
  });

  it('truncates and deletes whole grapheme clusters', () => {
    expect(truncate('東京 Radio', 6)).toBe('東京 …');
    expect(removeLastGrapheme('Café📻')).toBe('Café');
  });

  it('slices marquee windows on terminal-cell boundaries', () => {
    expect(sliceDisplay('AB東京CD', 2, 4)).toBe('東京');
    expect(sliceDisplay('AB東京CD', 4, 4)).toBe('京CD');
  });
});
