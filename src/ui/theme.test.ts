import {describe, expect, it} from 'vitest';
import {receiverStyleNames, themeNames} from '../types.js';
import {themeAccent, themeContributionColors, nextReceiverStyle, nextTheme} from './theme.js';
import type {ThemeName, ReceiverStyle} from '../types.js';

describe('themeContributionColors', () => {
  it('uses the selected display color as the strongest graph and legend color', () => {
    for (const theme of themeNames) {
      const colors = themeContributionColors(theme);
      expect(colors).toHaveLength(5);
      expect(colors[4]).toBe(themeAccent(theme));
    }
  });
});

describe('nextTheme', () => {
  it('cycles through all available display colors', () => {
    let theme: ThemeName = 'green';
    const seen = new Set<ThemeName>([theme]);

    for (let i = 0; i < themeNames.length; i++) {
      theme = nextTheme(theme);
      seen.add(theme);
    }

    expect(seen.size).toBe(themeNames.length);
    for (const availableTheme of themeNames) {
      expect(seen.has(availableTheme)).toBe(true);
    }
  });
});

describe('nextReceiverStyle', () => {
  it('cycles through all available receiver styles', () => {
    let style: ReceiverStyle = 'spectrum';
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
