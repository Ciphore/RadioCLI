import {describe, expect, it} from 'vitest';
import {resolveCommandDetails} from './executables.js';

describe('command resolution', () => {
  it('finds the WinGet shinchiro mpv installer location without PATH', () => {
    const expected = 'C:\\Program Files\\MPV Player\\mpv.exe';
    const resolution = resolveCommandDetails('mpv', {
      platform: 'win32',
      env: {PATH: '', ProgramFiles: 'C:\\Program Files'},
      home: 'C:\\Users\\listener',
      isRunnable: path => path === expected,
      registryPaths: () => []
    });

    expect(resolution).toEqual({path: expected, discovery: 'application-directory'});
  });

  it('supports per-user Windows mpv installations', () => {
    const expected = 'C:\\Users\\listener\\AppData\\Local\\Programs\\MPV\\mpv.exe';
    const resolution = resolveCommandDetails('mpv', {
      platform: 'win32',
      env: {PATH: '', LOCALAPPDATA: 'C:\\Users\\listener\\AppData\\Local'},
      home: 'C:\\Users\\listener',
      isRunnable: path => path === expected,
      registryPaths: () => []
    });

    expect(resolution).toEqual({path: expected, discovery: 'application-directory'});
  });

  it('uses registered Windows installation information as a fallback', () => {
    const expected = 'D:\\Apps\\mpv\\mpv.exe';
    const resolution = resolveCommandDetails('mpv', {
      platform: 'win32',
      env: {PATH: ''},
      home: 'C:\\Users\\listener',
      isRunnable: path => path === expected,
      registryPaths: () => [expected]
    });

    expect(resolution).toEqual({path: expected, discovery: 'windows-registry'});
  });

  it('still prefers PATH over platform-specific fallback locations', () => {
    const expected = '/custom/bin/mpv';
    const resolution = resolveCommandDetails('mpv', {
      platform: 'linux',
      env: {PATH: '/custom/bin:/usr/bin'},
      home: '/home/listener',
      isRunnable: path => path === expected,
      registryPaths: () => []
    });

    expect(resolution).toEqual({path: expected, discovery: 'path'});
  });

  it('does not apply Windows application paths on macOS or Linux', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(resolveCommandDetails('mpv', {
        platform,
        env: {PATH: '', ProgramFiles: '/not/a/native/path'},
        home: `/home/${platform}`,
        isRunnable: () => false,
        registryPaths: () => {
          throw new Error('Windows registry must not be queried');
        }
      })).toEqual({path: null, discovery: 'missing'});
    }
  });
});
