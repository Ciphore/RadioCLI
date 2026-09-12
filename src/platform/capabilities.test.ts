import {describe, expect, it} from 'vitest';
import {identifyPlatform} from './runtime.js';
import {platformCapabilities} from './capabilities.js';

describe('independent capabilities', () => {
  it('keeps playback and private storage independent of an unavailable scheduler/desktop', () => {
    const report = platformCapabilities(identifyPlatform({platform: 'freebsd', env: {}}), {backends: ['mpv'], commands: [], graphicalSession: false});
    expect(report.playback.status).toBe('available');
    expect(report.playbackControls.status).toBe('available');
    expect(report.backgroundScheduling.status).toBe('unavailable');
    expect(report.externalUrl.status).toBe('unavailable');
    expect(report.clipboard.status).toBe('unavailable');
    expect(report.filePermissions.status).toBe('available');
    expect(report.storage.status).toBe('unverified');
    expect(report.airPlay.status).toBe('unavailable');
  });

  it('never turns executable discovery into scheduler or wake verification', () => {
    const host = identifyPlatform({platform: 'linux', env: {}});
    const evidence = {backends: ['mpv'], commands: ['systemctl', 'systemd-inhibit'], graphicalSession: false};
    expect(platformCapabilities(host, evidence).backgroundScheduling.status).toBe('unverified');
    expect(platformCapabilities(host, {...evidence, scheduler: {supported: false, message: 'No user manager'}}).backgroundScheduling).toMatchObject({status: 'unavailable', message: 'No user manager'});
    expect(platformCapabilities(host, {...evidence, scheduler: {supported: true, message: 'User manager responded'}}).backgroundScheduling.status).toBe('available');
    expect(platformCapabilities(host, evidence).wakeRequests.status).toBe('unavailable');
    expect(platformCapabilities(host, evidence).sleepInhibition.status).toBe('unverified');
  });

  it.each(['ffplay', 'vlc'])('reports %s playback with explicitly unavailable interactive controls', backend => {
    const report = platformCapabilities(identifyPlatform({platform: 'linux', env: {}}), {backends: [backend], commands: [], graphicalSession: false});
    expect(report.playback.status).toBe('available');
    expect(report.playbackControls).toMatchObject({status: 'unavailable'});
    expect(report.playbackControls.message).toContain('mpv');
  });

  it('reports an absent optional command instead of advertising a usable integration', () => {
    const report = platformCapabilities(identifyPlatform({platform: 'darwin', env: {}}), {backends: [], commands: [], graphicalSession: true});
    expect(report.playback.status).toBe('unavailable');
    expect(report.externalUrl.status).toBe('unavailable');
    expect(report.clipboard.status).toBe('unavailable');
    expect(report.sleepInhibition.status).toBe('unavailable');
    expect(report.airPlay.status).toBe('unavailable');
  });

  it('keeps read-only storage and missing tools useful to doctor', () => {
    const report = platformCapabilities(identifyPlatform({platform: 'win32', env: {}}), {backends: ['mpv'], commands: [], graphicalSession: false, storageWritable: false});
    expect(report.storage).toMatchObject({status: 'unavailable'});
    expect(report.storage.message).toContain('RADIOCLI_HOME');
    expect(report.filePermissions.message).toContain('ACL');
    expect(report.atomicWrites.status).toBe('unavailable');
    expect(report.playback.status).toBe('available');
  });
});
