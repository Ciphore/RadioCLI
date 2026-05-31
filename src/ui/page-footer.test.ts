import {describe, expect, it} from 'vitest';
import {pageFooterText} from './page-footer.js';

describe('page footer shortcuts', () => {
  it('advertises full now-playing controls for mpv', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'mpv',
        screen: 'now-playing'
      })
    ).toContain('space/F8 pause');
  });

  it('labels ffplay controls as limited on now-playing', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'ffplay',
        screen: 'now-playing'
      })
    ).toBe('ffplay fallback: install mpv for pause/mute/media keys · f favorite · s sleep · d diagnostics · b home');
  });

  it('does not advertise pause for AirPlay on now-playing', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'airplay',
        screen: 'now-playing'
      })
    ).toBe('AirPlay: +/- volume · m mute · f favorite · s sleep · d diagnostics · b home');
  });
});
