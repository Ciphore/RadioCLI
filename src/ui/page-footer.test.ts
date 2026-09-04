import {describe, expect, it} from 'vitest';
import {balancedFooterLegendRows, fullFooterRowCount, fullStatusFooterRows, microPlaybackControlsText, microShortcutFooterText, pageFooterText} from './page-footer.js';
import {displayWidth} from './format.js';

describe('page footer shortcuts', () => {
  it('reuses the Now Playing station-status row for transient display notices', () => {
    expect(fullFooterRowCount('now-playing')).toBe(3);
    expect(fullStatusFooterRows('now-playing', 'Display color: ruby', null, null)).toEqual([
      {key: 'playback', text: 'Display color: ruby'}
    ]);
    expect(fullStatusFooterRows('now-playing', null, null, null)).toEqual([{key: 'playback', text: ' '}]);
  });

  it('keeps separate notice and station-status rows on other full-size tabs', () => {
    expect(fullFooterRowCount('library')).toBe(4);
    expect(fullStatusFooterRows('library', 'Display color: ruby', null, 'KEXP · playing')).toEqual([
      {key: 'notice', text: 'Display color: ruby'},
      {key: 'playback', text: 'KEXP · playing'}
    ]);
  });

  it('places exit confirmation in the station-status row', () => {
    expect(fullStatusFooterRows('library', null, 'Ctrl+C again to exit', 'KEXP · playing')).toEqual([
      {key: 'notice', text: ' '},
      {key: 'playback', text: 'Ctrl+C again to exit'}
    ]);
  });

  it('keeps essential playback controls visible in micro layouts', () => {
    expect(microPlaybackControlsText('mpv')).toContain('space pause');
    expect(microPlaybackControlsText('mpv')).toContain('+/- volume');
    expect(microPlaybackControlsText('mpv')).toContain(',/. station');
    expect(microPlaybackControlsText('airplay')).not.toContain('space pause');
  });

  it('balances long page and global legends across both rows without ellipses', () => {
    const rows = balancedFooterLegendRows(
      '↑/↓ or j/k/p move · Enter choose/create/edit · n new · Space toggle · g Guard · x twice delete · t station test · r repair · b Overview',
      '←/→ tabs · ? help · q quit',
      48,
      2,
      8
    );
    expect(rows).toHaveLength(2);
    expect(rows.every(row => displayWidth(row) <= 48)).toBe(true);
    expect(rows.join('\n')).not.toContain('…');
    expect(rows.join('\n')).toMatch(/(?:^| · )\?(?: help)?(?: · |$)/m);
    expect(rows.join('\n')).toMatch(/(?:^| · )q(?: quit)?(?: · |$)/m);
    expect(displayWidth(rows[1] ?? '')).toBeLessThanOrEqual(40);
    expect(rows.join('\n')).not.toContain('v0.2.1');
    expect(rows.every(row => row.trim().length > 0)).toBe(true);
  });

  it('uses key-only legends in micro layouts', () => {
    const text = microShortcutFooterText('↑/↓ or j/k/p move · Enter choose/create/edit · n new · Space toggle · g Guard', 26);
    expect(displayWidth(text)).toBeLessThanOrEqual(26);
    expect(text).toContain('↑/↓/j/k/p');
    expect(text).toContain('←/→');
    expect(text).toContain('?');
    expect(text).toContain('q');
    expect(text).not.toMatch(/move|select|help|quit/);
    expect(text).not.toContain('…');
  });

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
    ).toBe('ffplay fallback: install mpv for pause/mute/media keys · f favorite · s sleep · d diagnostics · b Overview');
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
    ).toBe('AirPlay: +/- volume · m mute · f favorite · s sleep · d diagnostics · b Overview');
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

  it('advertises the location shortcut on Overview and Nearby', () => {
    const base = {
      capturingTransportAction: null,
      commandMode: false,
      commandText: '',
      editingCountryFilter: false,
      editingSearch: false
    } as const;

    expect(pageFooterText({...base, screen: 'home'})).toContain('l location');
    expect(pageFooterText({...base, screen: 'nearby'})).toContain('l location');
    expect(pageFooterText({...base, screen: 'countries'})).not.toContain('l location');
  });

  it('advertises result navigation while editing search text', () => {
    expect(
      pageFooterText({
        capturingTransportAction: null,
        commandMode: false,
        commandText: '',
        editingCountryFilter: false,
        editingSearch: true,
        playbackBackend: 'mpv',
        screen: 'search'
      })
    ).toBe('Type query · ↑/↓ move results · Ctrl+↑/↓ history · Enter search/tune · Esc finish');
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
