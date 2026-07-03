import {describe, expect, it} from 'vitest';
import {defaultReceiverStyle, receiverStyleNames, themeNames} from '../types.js';
import {
  appBackground,
  nextReceiverStyle,
  nextTheme,
  panelBackground,
  textDim,
  textMuted,
  themeAccent,
  themeContributionColors
} from './theme.js';
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

describe('neutral text colors', () => {
  it('keeps muted text readable on the forced dark backgrounds', () => {
    for (const textColor of [textMuted, textDim]) {
      expect(textColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(textColor, appBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(textColor, panelBackground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('nextTheme', () => {
  it('uses the ultracode purple as the violet display color', () => {
    expect(themeAccent('violet')).toBe('#8c50f0');
    expect(themeContributionColors('violet').at(-1)).toBe('#8c50f0');
  });

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
    let style: ReceiverStyle = defaultReceiverStyle;
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

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = channels;

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '');

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}
