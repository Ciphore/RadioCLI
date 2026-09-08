import {createContext, useContext} from 'react';
import {resolveTerminalCapabilities, type TerminalColorLevel, type TerminalEvidence} from '../platform/terminal.js';
import {appBackground, panelBackground} from './theme.js';

type DisplayBackgrounds = {
  app: string | undefined;
  panel: string | undefined;
};

export type DisplayMode = DisplayBackgrounds & {
  ascii: boolean;
  reduceMotion: boolean;
  screenReader: boolean;
  colorLevel: TerminalColorLevel;
};

type DisplaySettings = {
  transparentBackground?: boolean;
  asciiMode?: boolean;
  reduceMotion?: boolean;
};

const opaqueBackgrounds: DisplayBackgrounds = {app: appBackground, panel: panelBackground};
const transparentBackgrounds: DisplayBackgrounds = {app: undefined, panel: undefined};

// Sixteen-color palettes cannot safely reproduce our dark fills. Let those
// terminals keep their own background while Ink quantizes the foregrounds.
export function resolveDisplayMode(settings: DisplaySettings, env: NodeJS.ProcessEnv = process.env, evidence: TerminalEvidence = {}): DisplayMode {
  const terminal = resolveTerminalCapabilities(env, {...settings, ...evidence});
  const backgrounds = settings.transparentBackground || terminal.colorLevel < 2 ? transparentBackgrounds : opaqueBackgrounds;
  return {...backgrounds, ascii: !terminal.unicode, reduceMotion: terminal.reduceMotion, screenReader: terminal.screenReader, colorLevel: terminal.colorLevel};
}

const defaultMode: DisplayMode = resolveDisplayMode({}, {});

export const DisplayContext = createContext<DisplayMode>(defaultMode);

export function useDisplay(): DisplayMode {
  return useContext(DisplayContext);
}

// Ink's rounded/single borders are Unicode box-drawing; "classic" is ASCII
// (+-|) and renders on terminals and fonts without box-drawing glyphs.
export function panelBorderStyle(ascii: boolean, base: 'round' | 'single' = 'round'): 'round' | 'single' | 'classic' {
  return ascii ? 'classic' : base;
}
