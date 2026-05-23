import type {ThemeName} from '../types.js';

export function themeColor(theme: ThemeName): string {
  if (theme === 'amber') {
    return 'yellow';
  }

  if (theme === 'blue') {
    return 'cyan';
  }

  return 'green';
}

export function themeAccent(theme: ThemeName): string {
  if (theme === 'amber') {
    return '#ffb000';
  }

  if (theme === 'blue') {
    return '#53a8ff';
  }

  return '#74f28a';
}

export function nextTheme(theme: ThemeName): ThemeName {
  if (theme === 'green') {
    return 'amber';
  }

  if (theme === 'amber') {
    return 'blue';
  }

  return 'green';
}
