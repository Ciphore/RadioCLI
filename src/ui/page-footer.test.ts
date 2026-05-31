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

  it('labels the Settings output shortcut without backend jargon', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'mpv',
        screen: 'settings'
      })
    ).toContain('o output');
  });

  it('keeps AirPlay code entry hidden until AirPlay streaming is ready', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'mpv',
        screen: 'airplay-settings'
      })
    ).toBe('↑/↓ choose · Enter select receiver · r refresh · b settings');
  });

  it('advertises the dedicated AirPlay receiver picker controls', () => {
    expect(
      pageFooterText({
        canEnterAirPlayCode: true,
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'airplay',
        screen: 'airplay-settings'
      })
    ).toBe('↑/↓ choose · Enter select receiver · c code · r refresh · b settings');
  });

  it('advertises the AirPlay code entry controls', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: false,
        playbackBackend: 'airplay',
        screen: 'airplay-code'
      })
    ).toBe('Type receiver code · Backspace edit · Enter submit · Esc AirPlay');
  });
});
