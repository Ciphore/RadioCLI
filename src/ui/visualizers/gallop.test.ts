import {describe, expect, it} from 'vitest';
import {buildGallop, buildGallopFine} from './gallop.js';
import {horseStrideFrames, horseStrideHeight, horseStrideWidth} from './horse-stride.js';

const inkBounds = (rows: ReturnType<typeof buildGallop>) => {
  const points = rows.flatMap((row, y) => [...row.text]
    .flatMap((glyph, x) => glyph === ' ' ? [] : [{x, y}]));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    count: points.length,
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1
  };
};

const masks = (rows: ReturnType<typeof buildGallop>) => rows.flatMap(row => [...row.text]
  .map(glyph => glyph === ' ' ? 0 : glyph.charCodeAt(0) - 0x2800));
const dotCount = (values: number[]) => values.reduce(
  (total, mask) => total + mask.toString(2).replaceAll('0', '').length,
  0
);

describe('gallop fine', () => {
  it('uses complete fixed-canvas poses and loops without accumulating translation', () => {
    for (const frame of horseStrideFrames) {
      expect(Buffer.from(frame, 'base64')).toHaveLength(horseStrideWidth * horseStrideHeight / 8);
    }
    for (let pulse = 0; pulse < horseStrideFrames.length; pulse++) {
      expect(buildGallopFine(pulse + horseStrideFrames.length * 100, 80, 14, 'violet'))
        .toEqual(buildGallopFine(pulse, 80, 14, 'violet'));
    }
    expect(new Set(horseStrideFrames).size).toBeGreaterThanOrEqual(10);
  });

  it('scales down and up with the receiver viewport while staying inside it', () => {
    for (let pulse = 0; pulse < horseStrideFrames.length; pulse++) {
      const small = buildGallopFine(pulse, 40, 8, 'violet');
      const regular = buildGallopFine(pulse, 80, 14, 'violet');
      const large = buildGallopFine(pulse, 160, 28, 'violet');
      const smallBounds = inkBounds(small);
      const regularBounds = inkBounds(regular);
      const largeBounds = inkBounds(large);

      expect(small).toHaveLength(8);
      expect(regular).toHaveLength(14);
      expect(large).toHaveLength(28);
      expect(small.every(row => row.text.length === 40)).toBe(true);
      expect(regular.every(row => row.text.length === 80)).toBe(true);
      expect(large.every(row => row.text.length === 160)).toBe(true);
      expect(smallBounds.width).toBeLessThan(regularBounds.width);
      expect(smallBounds.height).toBeLessThan(regularBounds.height);
      expect(largeBounds.width).toBeGreaterThan(regularBounds.width);
      expect(largeBounds.height).toBeGreaterThan(regularBounds.height);
    }
  });

  it('keeps themed transparent linework and modestly thins the base drawing', () => {
    for (let pulse = 0; pulse < horseStrideFrames.length; pulse++) {
      const original = masks(buildGallop(pulse, 80, 14, 'ruby'));
      const rows = buildGallopFine(pulse, 80, 14, 'ruby');
      const fine = masks(rows);

      expect(dotCount(fine)).toBeLessThan(dotCount(original) * 0.98);
      expect(dotCount(fine)).toBeGreaterThanOrEqual(dotCount(original) * 0.86);
      fine.forEach((mask, index) => expect(mask & original[index]!).toBe(mask));
      for (const row of rows) {
        expect(row.text).toMatch(/^[ \u2801-\u28ff]*$/);
        expect(row.segments.every(segment => !('backgroundColor' in segment))).toBe(true);
        expect(row.color).toBe('#ff5f87');
      }
    }
  });
});
