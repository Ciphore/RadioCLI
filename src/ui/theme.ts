import {defaultReceiverStyle, receiverStyleNames, themeNames, type ReceiverStyle, type ThemeName} from '../types.js';

const receiverStyles: readonly ReceiverStyle[] = receiverStyleNames;
export const appBackground = '#070a0f';
export const panelBackground = '#090d14';
export const panelBorder = '#28313c';

// Shared neutral palette. Use these named tokens instead of ad-hoc hex literals
// so secondary text, rules, and map shading stay consistent across every screen.
export const textDim = '#5b6573';
export const textHighlight = '#d8c66f';
export const mapLand = '#33414f';
export const mapWater = '#1a2430';
export const mapMarker = '#7dd3fc';
export const exploreMapLand = '#a0a0c0';

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

  if (theme === 'teal') {
    return '#5eead4';
  }

  if (theme === 'violet') {
    return '#a78bfa';
  }

  if (theme === 'copper') {
    return '#d08770';
  }

  if (theme === 'cyan') {
    return '#22d3ee';
  }

  if (theme === 'lime') {
    return '#a3e635';
  }

  if (theme === 'coral') {
    return '#ff7e6b';
  }

  if (theme === 'rose') {
    return '#ff8fc7';
  }

  if (theme === 'slate') {
    return '#9fb4cf';
  }

  if (theme === 'mono') {
    return '#d0d0d0';
  }

  return '#74f28a';
}

export function themeContributionColors(theme: ThemeName): string[] {
  const emptyContribution = '#1c1c1c';

  if (theme === 'amber') {
    return [emptyContribution, '#5f3700', '#9a6200', '#d68a00', '#ffb000'];
  }

  if (theme === 'blue') {
    return [emptyContribution, '#12385f', '#1f6feb', '#3388dd', '#53a8ff'];
  }

  if (theme === 'ruby') {
    return [emptyContribution, '#4c1230', '#8f274f', '#c93f68', '#ff5f87'];
  }

  if (theme === 'ice') {
    return [emptyContribution, '#24474d', '#4a95a0', '#86dce8', '#b9f6ff'];
  }

  if (theme === 'teal') {
    return [emptyContribution, '#123f3c', '#1f766c', '#2dd4bf', '#5eead4'];
  }

  if (theme === 'violet') {
    return [emptyContribution, '#302047', '#5b3f8f', '#7c5cff', '#a78bfa'];
  }

  if (theme === 'copper') {
    return [emptyContribution, '#44281f', '#7f4f37', '#b86f52', '#d08770'];
  }

  if (theme === 'cyan') {
    return [emptyContribution, '#0e3b42', '#168a9e', '#22b8cf', '#22d3ee'];
  }

  if (theme === 'lime') {
    return [emptyContribution, '#2f3d12', '#5f7d1f', '#84b32b', '#a3e635'];
  }

  if (theme === 'coral') {
    return [emptyContribution, '#4c2018', '#9a4032', '#d65c49', '#ff7e6b'];
  }

  if (theme === 'rose') {
    return [emptyContribution, '#4c2238', '#8f3f6a', '#d65c9a', '#ff8fc7'];
  }

  if (theme === 'slate') {
    return [emptyContribution, '#2a3340', '#4f6178', '#7c91ab', '#9fb4cf'];
  }

  if (theme === 'mono') {
    return [emptyContribution, '#3a3a3a', '#767676', '#b0b0b0', '#d0d0d0'];
  }

  return [emptyContribution, '#0e4429', '#26a641', '#39d353', '#74f28a'];
}

export function nextTheme(theme: ThemeName): ThemeName {
  const index = themeNames.indexOf(theme);
  return themeNames[(index + 1) % themeNames.length] ?? 'green';
}

export function nextReceiverStyle(style: ReceiverStyle): ReceiverStyle {
  const index = receiverStyles.indexOf(style);
  return receiverStyles[(index + 1) % receiverStyles.length] ?? defaultReceiverStyle;
}
