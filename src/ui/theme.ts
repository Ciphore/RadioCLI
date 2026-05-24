import {receiverStyleNames, type ReceiverStyle, type ThemeName} from '../types.js';

const receiverStyles: readonly ReceiverStyle[] = receiverStyleNames;
export const appBackground = '#070a0f';
export const panelBackground = '#090d14';
export const panelBorder = '#28313c';

export function themeAccent(theme: ThemeName): string {
  if (theme === 'amber') {
    return '#ffb000';
  }

  if (theme === 'blue') {
    return '#53a8ff';
  }

  if (theme === 'ruby') {
    return '#ff5f87';
  }

  if (theme === 'ice') {
    return '#b9f6ff';
  }

  if (theme === 'mono') {
    return '#d0d0d0';
  }

  return '#74f28a';
}

export function themeContributionColors(theme: ThemeName): string[] {
  if (theme === 'amber') {
    return ['#161b22', '#5f3700', '#9a6200', '#d68a00', '#ffb000'];
  }

  if (theme === 'blue') {
    return ['#161b22', '#12385f', '#1f6feb', '#3388dd', '#53a8ff'];
  }

  if (theme === 'ruby') {
    return ['#161b22', '#4c1230', '#8f274f', '#c93f68', '#ff5f87'];
  }

  if (theme === 'ice') {
    return ['#161b22', '#24474d', '#4a95a0', '#86dce8', '#b9f6ff'];
  }

  if (theme === 'mono') {
    return ['#161b22', '#3a3a3a', '#767676', '#b0b0b0', '#d0d0d0'];
  }

  return ['#161b22', '#0e4429', '#26a641', '#39d353', '#74f28a'];
}

export function nextTheme(theme: ThemeName): ThemeName {
  const themeNames: readonly ThemeName[] = ['green', 'amber', 'blue', 'ruby', 'ice', 'mono'];
  const index = themeNames.indexOf(theme);
  return themeNames[(index + 1) % themeNames.length] ?? 'green';
}

export function nextReceiverStyle(style: ReceiverStyle): ReceiverStyle {
  const index = receiverStyles.indexOf(style);
  return receiverStyles[(index + 1) % receiverStyles.length] ?? 'sdr';
}
