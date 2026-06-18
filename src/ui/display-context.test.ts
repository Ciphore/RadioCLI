import {describe, expect, it} from 'vitest';
import {noColorRequested, panelBorderStyle, resolveDisplayMode} from './display-context.js';
import {appBackground, panelBackground} from './theme.js';

describe('display mode', () => {
  it('honors the NO_COLOR convention only for non-empty values', () => {
    expect(noColorRequested({NO_COLOR: '1'})).toBe(true);
    expect(noColorRequested({NO_COLOR: ''})).toBe(false);
    expect(noColorRequested({})).toBe(false);
  });

  it('keeps opaque panel fills by default', () => {
    expect(resolveDisplayMode({}, {})).toEqual({
      app: appBackground,
      panel: panelBackground,
      ascii: false,
      reduceMotion: false
    });
  });

  it('drops panel fills when transparent mode or NO_COLOR is requested', () => {
    expect(resolveDisplayMode({transparentBackground: true}, {})).toMatchObject({app: undefined, panel: undefined});
    expect(resolveDisplayMode({}, {NO_COLOR: 'yes'})).toMatchObject({app: undefined, panel: undefined});
  });

  it('carries the ascii and reduce-motion preferences', () => {
    expect(resolveDisplayMode({asciiMode: true, reduceMotion: true}, {})).toMatchObject({ascii: true, reduceMotion: true});
  });

  it('switches panel borders to ASCII classic in ascii mode', () => {
    expect(panelBorderStyle(false)).toBe('round');
    expect(panelBorderStyle(false, 'single')).toBe('single');
    expect(panelBorderStyle(true, 'single')).toBe('classic');
  });
});
