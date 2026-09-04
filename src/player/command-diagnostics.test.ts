import {describe, expect, it, vi} from 'vitest';
import {diagnoseCommand} from './command-diagnostics.js';

describe('command diagnostics', () => {
  it('reports an installed executable that launches successfully', () => {
    const execute = vi.fn(() => ({
      pid: 1,
      output: [],
      stdout: 'mpv 0.41.0 Copyright © mpv/MPlayer/mplayer2 projects\n',
      stderr: '',
      status: 0,
      signal: null
    }));
    const diagnostic = diagnoseCommand('mpv', {
      resolve: () => ({path: 'C:\\Program Files\\MPV Player\\mpv.exe', discovery: 'application-directory'}),
      execute
    });

    expect(diagnostic).toEqual({
      path: 'C:\\Program Files\\MPV Player\\mpv.exe',
      discovery: 'application-directory',
      launchable: true,
      version: 'mpv 0.41.0 Copyright © mpv/MPlayer/mplayer2 projects',
      error: null
    });
    expect(execute).toHaveBeenCalledWith('C:\\Program Files\\MPV Player\\mpv.exe', ['--version'], expect.objectContaining({timeout: 3000}));
  });

  it('distinguishes a missing command from one that cannot launch', () => {
    expect(diagnoseCommand('mpv', {
      resolve: () => ({path: null, discovery: 'missing'}),
      execute: vi.fn()
    })).toMatchObject({path: null, launchable: false, error: 'not found'});

    expect(diagnoseCommand('mpv', {
      resolve: () => ({path: '/opt/mpv', discovery: 'application-directory'}),
      execute: vi.fn(() => ({pid: 1, output: [], stdout: '', stderr: '', status: 1, signal: null}))
    })).toMatchObject({path: '/opt/mpv', launchable: false, error: 'exited with status 1'});
  });
});
