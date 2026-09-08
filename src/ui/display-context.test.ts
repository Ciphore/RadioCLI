import {describe, expect, it} from 'vitest';
import {panelBorderStyle, resolveDisplayMode} from './display-context.js';
import {appBackground, panelBackground} from './theme.js';

describe('display mode', () => {
  it('honors the NO_COLOR convention only for non-empty values', () => {
    expect(resolveDisplayMode({}, {NO_COLOR: '1'})).toMatchObject({colorLevel: 0, app: undefined, panel: undefined});
    expect(resolveDisplayMode({}, {NO_COLOR: ''})).toMatchObject({colorLevel: 3, app: appBackground, panel: panelBackground});
    expect(resolveDisplayMode({}, {})).toMatchObject({colorLevel: 3, app: appBackground, panel: panelBackground});
  });

  it('keeps opaque panel fills by default', () => {
    expect(resolveDisplayMode({}, {})).toEqual({
      app: appBackground,
      panel: panelBackground,
      ascii: false,
      reduceMotion: false,
      screenReader: false,
      colorLevel: 3
    });
  });

  it('drops panel fills when transparent mode or NO_COLOR is requested', () => {
    expect(resolveDisplayMode({transparentBackground: true}, {})).toMatchObject({app: undefined, panel: undefined});
    expect(resolveDisplayMode({}, {NO_COLOR: 'yes'})).toMatchObject({app: undefined, panel: undefined});
  });

  it('carries the ascii and reduce-motion preferences', () => {
    expect(resolveDisplayMode({asciiMode: true, reduceMotion: true}, {})).toMatchObject({ascii: true, reduceMotion: true});
  });

  it('applies terminal overrides without changing persisted preferences', () => {
    const settings = Object.freeze({asciiMode: false, reduceMotion: false, transparentBackground: false});
    expect(resolveDisplayMode(settings, {TERM: 'dumb'})).toMatchObject({ascii: true, reduceMotion: true, colorLevel: 0, app: undefined, panel: undefined});
    expect(settings).toEqual({asciiMode: false, reduceMotion: false, transparentBackground: false});
    expect(resolveDisplayMode({asciiMode: true}, {RADIOCLI_UNICODE: '1'}).ascii).toBe(false);
  });

  it('drops forced dark backgrounds on sixteen-color terminals', () => {
    expect(resolveDisplayMode({}, {TERM: 'xterm'})).toMatchObject({colorLevel: 1, app: undefined, panel: undefined});
    expect(resolveDisplayMode({}, {TERM: 'xterm-256color'})).toMatchObject({colorLevel: 2, app: appBackground, panel: panelBackground});
  });

  it.each([{INK_SCREEN_READER: 'true'}, {RADIOCLI_SCREEN_READER: '1'}])('marks %j as static screen-reader output', env => {
    expect(resolveDisplayMode({}, env)).toMatchObject({screenReader: true, reduceMotion: true, app: undefined, panel: undefined});
  });

  it('switches panel borders to ASCII classic in ascii mode', () => {
    expect(panelBorderStyle(false)).toBe('round');
    expect(panelBorderStyle(false, 'single')).toBe('single');
    expect(panelBorderStyle(true, 'single')).toBe('classic');
  });
});
