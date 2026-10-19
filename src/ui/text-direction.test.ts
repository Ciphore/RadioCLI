import {describe, expect, it} from 'vitest';
import {sanitizeTerminalText} from '../safety.js';
import {textDirection} from './text-direction.js';

describe('marquee text direction', () => {
  it.each([
    'רדיו ישראל', 'راديو العربية', 'رادیو فارسی', 'ریڈیو پاکستان',
    'ܪܕܝܘ', 'ރޭޑިއޯ', 'ߒߞߏ', '𞤀𞤣𞤤𞤢𞤥', '𐤀𐤁𐤂',
    'ﭏ רדיו', 'ﺭﺍﺩﻳﻮ', '𞸀 راديو'
  ])('detects RTL scripts in %s', text => {
    expect(textDirection(text)).toBe('rtl');
  });

  it.each(['Radio', 'Café', '東京 FM', 'Москва', 'Αθήνα', 'रेडियो', 'วิทยุ', '广播'])('retains LTR for %s', text => {
    expect(textDirection(text)).toBe('ltr');
  });

  it.each(['', '123.45', '📻 🎵', '— () …', '\u0301\u05b0\u064e'])('defaults to LTR without a strong character in %s', text => {
    expect(textDirection(text)).toBe('ltr');
  });

  it.each(['101.7 — רדיו FM', '📻 (راديو) 101', '\u05b0רדיו', '\u064eراديو', '١٢٣ راديو', '۱۲۳ رادیو'])('skips weak and neutral prefixes in %s', text => {
    expect(textDirection(text)).toBe('rtl');
  });

  it('uses the first strong character, rather than the last or majority script', () => {
    expect(textDirection('Radio العربية')).toBe('ltr');
    expect(textDirection('راديو International FM')).toBe('rtl');
    expect(textDirection('東京 راديو')).toBe('ltr');
  });

  it('handles strong characters that are not letters according to their bidi class', () => {
    expect(textDirection('־ Radio')).toBe('rtl'); // Hebrew maqaf: R.
    expect(textDirection('߁ Radio')).toBe('rtl'); // NKo digit: R.
    expect(textDirection('१ راديو')).toBe('ltr'); // Devanagari digit: L.
    expect(textDirection('🇮🇱 רדיו')).toBe('ltr'); // Regional indicators: L.
  });

  it('works on sanitized content without reintroducing bidi controls', () => {
    const text = sanitizeTerminalText('\u200e\u202eراديو\u202c\u2069');
    expect(text).toBe('راديو');
    expect(textDirection(text!)).toBe('rtl');
  });
});
