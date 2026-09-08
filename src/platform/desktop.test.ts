import {describe, expect, it} from 'vitest';
import {browserCommands, clipboardCandidates, hasGraphicalSession} from './desktop.js';
import {identifyPlatform} from './runtime.js';

describe('portable desktop command plans', () => {
  it.each(['linux', 'freebsd', 'openbsd', 'netbsd'])('uses explicitly supported Unix desktop tools on %s', platform => {
    const host = identifyPlatform({platform, env: {}});
    expect(browserCommands(host)).toEqual([{command: 'xdg-open', args: []}]);
    expect(clipboardCandidates(host).map(item => item.command)).toEqual(['wl-copy', 'xclip', 'xsel']);
    expect(hasGraphicalSession(host, {})).toBe(false);
    expect(hasGraphicalSession(host, {DISPLAY: ':0'})).toBe(true);
  });
  it('requires a deliberate adapter on an unknown Unix system', () => {
    const host = identifyPlatform({platform: 'futureos', env: {}});
    expect(browserCommands(host)).toEqual([]);
    expect(clipboardCandidates(host)).toEqual([]);
    expect(hasGraphicalSession(host, {DISPLAY: ':0'})).toBe(false);
  });

  it.each(['android', 'linux'])('plans native Termux browser and stdin clipboard helpers on %s', platform => {
    const env = {TERMUX_VERSION: '0.118.3'};
    const host = identifyPlatform({platform, env});
    expect(browserCommands(host)).toEqual([{command: 'termux-open-url', args: []}]);
    expect(clipboardCandidates(host)).toEqual([{command: 'termux-clipboard-set', args: []}]);
    expect(hasGraphicalSession(host, env)).toBe(true);
    expect(hasGraphicalSession(host, {...env, SSH_CONNECTION: 'remote'})).toBe(false);
    expect(hasGraphicalSession(host, {...env, SSH_TTY: '/dev/pts/1', DISPLAY: ':0'})).toBe(false);
  });

  it.each(['android', 'haiku', 'sunos', 'aix'])('does not infer desktop integration for %s from a DISPLAY value', platform => {
    const host = identifyPlatform({platform, env: {}});
    expect(browserCommands(host)).toEqual([]);
    expect(clipboardCandidates(host)).toEqual([]);
    expect(hasGraphicalSession(host, {DISPLAY: ':0'})).toBe(false);
  });
});
