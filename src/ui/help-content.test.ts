import {describe, expect, it} from 'vitest';
import {commandHelp, commandNames, completeCommand} from './help-content.js';

describe('completeCommand', () => {
  it('completes a unique prefix to the full command', () => {
    expect(completeCommand('vol', ['volume', 'mute'])).toBe('volume');
  });

  it('completes to the longest shared prefix when several match', () => {
    expect(completeCommand('se', ['search', 'settings', 'sleep'])).toBe('se');
    expect(completeCommand('sea', ['search', 'settings'])).toBe('search');
  });

  it('returns the input unchanged when nothing matches', () => {
    expect(completeCommand('zzz', ['search'])).toBe('zzz');
  });

  it('exposes every documented command name for completion', () => {
    for (const command of commandHelp) {
      expect(commandNames).toContain(command.name);
    }
  });
});

describe('AirPlay help visibility', () => {
  it('uses one filtered command collection for help counts and completion', async () => {
    const {commandHelpForAirPlay, commandNamesForAirPlay, helpItemCountForAirPlay} = await import('./help-content.js');
    expect(commandHelpForAirPlay(false).some(command => command.name.includes('airplay'))).toBe(false);
    expect(commandNamesForAirPlay(false).some(name => name.includes('airplay'))).toBe(false);
    expect(helpItemCountForAirPlay(true) - helpItemCountForAirPlay(false)).toBe(1);
    expect(completeCommand('air', commandNamesForAirPlay(false))).toBe('air');
    expect(commandNamesForAirPlay(true)).toContain('airplay-code');
  });
});
