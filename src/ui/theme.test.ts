import {describe, expect, it} from 'vitest';
import {receiverStyleNames} from '../types.js';
import {themeAccent, themeContributionColors, nextReceiverStyle} from './theme.js';
import type {ThemeName, ReceiverStyle} from '../types.js';

describe('themeContributionColors', () => {
  it('uses the selected display color as the strongest graph and legend color', () => {
    const themes: ThemeName[] = ['green', 'amber', 'blue', 'ruby', 'ice', 'mono'];

    for (const theme of themes) {
      const colors = themeContributionColors(theme);
      expect(colors).toHaveLength(5);
      expect(colors[4]).toBe(themeAccent(theme));
    }
  });
});

describe('nextReceiverStyle', () => {
  it('cycles through all available receiver styles', () => {
    let style: ReceiverStyle = 'sdr';
    const seen = new Set<ReceiverStyle>([style]);

    for (let i = 0; i < receiverStyleNames.length; i++) {
      style = nextReceiverStyle(style);
      seen.add(style);
    }

    expect(seen.size).toBe(receiverStyleNames.length);
    for (const s of receiverStyleNames) {
      expect(seen.has(s)).toBe(true);
    }
  });
});
