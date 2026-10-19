import {describe, expect, it, vi} from 'vitest';
import stringWidth from 'string-width';
import {displayWidth, padDisplayEnd, removeLastGrapheme, sliceDisplay, sliceDisplayFromEnd, truncate} from './format.js';

describe('terminal display formatting', () => {
  it('preserves spaces after a wide cluster intersecting the scrolling edge', () => {
    expect(sliceDisplay('🇯🇵1️⃣ Radio', 3, 4)).toBe('1️⃣ R');
    expect(sliceDisplay('東京 Radio', 1, 4)).toBe('東京');
  });

  it('measures CJK and emoji graphemes as double-width terminal cells', () => {
    expect(displayWidth('FM 東京 📻')).toBe(10);
    expect(padDisplayEnd('東京', 6)).toBe('東京  ');
  });

  it.each([
    ['🇯🇵', 2], ['🇺🇸 FM', 5], ['1️⃣', 2], ['#\u20e3', 2],
    ['♥︎', 1], ['©', 1], ['©️', 2], ['👩🏽‍💻', 2], ['Café', 4]
  ] as const)('measures %s consistently with terminal rendering', (value, width) => {
    expect(displayWidth(value)).toBe(width);
    expect(stringWidth(padDisplayEnd(value, 8))).toBe(8);
    expect(stringWidth(truncate(`${value} Station`, 4))).toBeLessThanOrEqual(4);
  });

  it('clips flag and keycap clusters without splitting them or exceeding the viewport', () => {
    expect(truncate('🇯🇵 Station', 4)).toBe('🇯🇵 …');
    expect(truncate('1️⃣ Station', 4)).toBe('1️⃣ …');
    expect(sliceDisplay('A🇯🇵1️⃣Z', 1, 4)).toBe('🇯🇵1️⃣');
    expect(sliceDisplayFromEnd('A🇯🇵1️⃣Z', 1, 4)).toBe('🇯🇵1️⃣');
  });

  it('truncates and deletes whole grapheme clusters', () => {
    expect(truncate('東京 Radio', 6)).toBe('東京 …');
    expect(removeLastGrapheme('Café📻')).toBe('Café');
  });

  it('slices marquee windows on terminal-cell boundaries', () => {
    expect(sliceDisplay('AB東京CD', 2, 4)).toBe('東京');
    expect(sliceDisplay('AB東京CD', 4, 4)).toBe('京CD');
  });

  it('slices from the end without dropping the tail at a wide-character boundary', () => {
    expect(sliceDisplayFromEnd('אבג東京ד', 0, 4)).toBe('京ד');
    expect(sliceDisplayFromEnd('אבג東京ד', 1, 4)).toBe('東京');
    expect(sliceDisplayFromEnd('אבג東京ד', 2, 4)).toBe('בג東');
    expect(sliceDisplayFromEnd('אבג東京ד', 4, 4)).toBe('אבג');
    expect(sliceDisplayFromEnd('אבג東京ד', 20, 4)).toBe('');
    expect(sliceDisplayFromEnd('אבג東京ד', 0, 0)).toBe('');
    expect(sliceDisplayFromEnd('אבג東京ד', 0, 20)).toBe('אבג東京ד');
  });

  it('keeps combining marks, surrogate pairs and joined emoji intact from the end', () => {
    expect(sliceDisplayFromEnd('אָבּגּ', 0, 2)).toBe('בּגּ');
    expect(sliceDisplayFromEnd('אב𞤀𞤣', 1, 2)).toBe('ב𞤀');
    expect(sliceDisplayFromEnd('אב👩‍👩‍👧‍👦ג', 1, 3)).toBe('ב👩‍👩‍👧‍👦');
    expect(sliceDisplayFromEnd('אב👩‍👩‍👧‍👦ג', 2, 3)).toBe('אב');
  });

  it('retains code-point clipping on runtimes without Intl.Segmenter', async () => {
    vi.stubGlobal('Intl', new Proxy(Intl, {get: (target, property) => property === 'Segmenter' ? undefined : Reflect.get(target, property)}));
    vi.resetModules();
    try {
      const fallback = await import('./format.js');
      expect(fallback.sliceDisplayFromEnd('אבגדהוזחטי', 0, 5)).toBe('וזחטי');
      expect(fallback.sliceDisplayFromEnd('אבגדהוזחטי', 1, 5)).toBe('הוזחט');
      expect(fallback.sliceDisplayFromEnd('אב𞤀𞤣', 1, 2)).toBe('ב𞤀');
      expect(fallback.sliceDisplay('ABCDEFGHIJ', 1, 5)).toBe('BCDEF');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
