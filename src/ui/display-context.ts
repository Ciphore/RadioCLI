import {createContext, useContext} from 'react';
import {appBackground, panelBackground} from './theme.js';

type DisplayBackgrounds = {
  app: string | undefined;
  panel: string | undefined;
};

export type DisplayMode = DisplayBackgrounds & {
  ascii: boolean;
  reduceMotion: boolean;
};

type DisplaySettings = {
  transparentBackground?: boolean;
  asciiMode?: boolean;
  reduceMotion?: boolean;
};

const opaqueBackgrounds: DisplayBackgrounds = {app: appBackground, panel: panelBackground};
const transparentBackgrounds: DisplayBackgrounds = {app: undefined, panel: undefined};

// Respect the NO_COLOR convention (https://no-color.org): any non-empty value
// opts the user out of our forced colors, including the dark panel fills.
export function noColorRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.NO_COLOR === 'string' && env.NO_COLOR.length > 0;
}

// Resolve the effective display mode from the user's settings and the NO_COLOR
// environment so light terminals keep their own background.
export function resolveDisplayMode(settings: DisplaySettings, env: NodeJS.ProcessEnv = process.env): DisplayMode {
  const backgrounds = settings.transparentBackground || noColorRequested(env) ? transparentBackgrounds : opaqueBackgrounds;
  return {...backgrounds, ascii: Boolean(settings.asciiMode), reduceMotion: Boolean(settings.reduceMotion)};
}

const defaultMode: DisplayMode = {...opaqueBackgrounds, ascii: false, reduceMotion: false};

export const DisplayContext = createContext<DisplayMode>(defaultMode);

export function useDisplay(): DisplayMode {
  return useContext(DisplayContext);
}

// Ink's rounded/single borders are Unicode box-drawing; "classic" is ASCII
// (+-|) and renders on terminals and fonts without box-drawing glyphs.
export function panelBorderStyle(ascii: boolean, base: 'round' | 'single' = 'round'): 'round' | 'single' | 'classic' {
  return ascii ? 'classic' : base;
}
