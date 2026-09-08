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
  });
});
