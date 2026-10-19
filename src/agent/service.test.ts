import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JsonLibraryStore} from '../storage/store.js';
import {defaultAgentControlSettings} from '../types.js';
import type {Station} from '../types.js';
import {startActiveAlarmSession} from '../alarms/active-session.js';
import {startRadioSession, type RadioSessionStatus} from './session.js';
import * as airPlayPolicyModule from '../player/airplay-policy.js';
import * as backendInstall from '../player/backend-install.js';
import {PlayerController} from '../player/player-controller.js';
import {AgentRadioService} from './service.js';
import {ProviderManager} from '../providers/provider-manager.js';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('agent radio service policy', () => {
  it('honors Nearby privacy before geolocation and returns useful failures and bounded results', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-nearby-'));
    roots.push(root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    store.updateSettings({enableNearbyLocation: false, agentControl: {...defaultAgentControlSettings, enabled: true}});
    const providers = new ProviderManager();
    const detect = vi.spyOn(providers, 'detectLocation').mockResolvedValue(null);
    const nearby = vi.spyOn(providers, 'nearby').mockResolvedValue([]);
    const service = new AgentRadioService({nodePath: '/node', cliPath: '/radiocli.js'}, store, providers);
    await expect(service.browse('nearby')).rejects.toThrow('disabled');
    expect(detect).not.toHaveBeenCalled();
    expect(nearby).not.toHaveBeenCalled();
    store.updateSettings({enableNearbyLocation: true});
    await expect(service.browse('nearby')).rejects.toThrow('approximate location');
    expect(nearby).not.toHaveBeenCalled();
    const location = {latitude: 35.6762, longitude: 139.6503, source: 'fixture'};
    const station: Station = {id: 'tokyo', provider: 'radio-browser', name: 'Tokyo', tags: []};
    detect.mockResolvedValue(location);
    nearby.mockResolvedValue([station]);
    await expect(service.browse('nearby', 500)).resolves.toEqual([station]);
    expect(nearby).toHaveBeenCalledWith(location, 50);
    nearby.mockRejectedValue(new Error('Directory unavailable'));
    await expect(service.browse('nearby')).rejects.toThrow('Directory unavailable');
  });

  it.each(['agent', 'cli'] as const)('requires Linux opt-in even when %s control is authorized', async source => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-airplay-'));
    roots.push(root); vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    store.updateSettings({agentControl: {...defaultAgentControlSettings, enabled: true}, preferredAirPlayDevice: 'saved'});
    const policy = airPlayPolicyModule.airPlayPolicy;
    vi.spyOn(airPlayPolicyModule, 'airPlayPolicy').mockImplementation(settings => policy(settings, {platform: 'linux', env: {}, release: ''}));
    const discovery = vi.spyOn(PlayerController.prototype, 'refreshAirPlayDevices');
    const service = new AgentRadioService({nodePath: '/node', cliPath: '/radiocli.js'}, store, undefined, source);
    await expect(service.listAirPlayDevices()).rejects.toThrow('setup --airplay');
    await expect(service.selectAirPlayDevice('saved')).rejects.toThrow('setup --airplay');
    await expect(service.submitAirPlayPasscode('1234')).rejects.toThrow('setup --airplay');
    expect(discovery).not.toHaveBeenCalled();
    expect(store.snapshot().settings.linuxAirPlayEnabled).not.toBe(true);
  });

  it.each(['agent', 'cli'] as const)('propagates an active TUI prerequisite failure to %s callers', async source => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-airplay-error-'));
    roots.push(root); vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    store.updateSettings({linuxAirPlayEnabled: true, agentControl: {...defaultAgentControlSettings, enabled: true}});
    vi.spyOn(airPlayPolicyModule, 'airPlayPolicy').mockReturnValue({eligible: true, enabled: true, state: 'enabled', message: 'Enabled.'});
    const status: RadioSessionStatus = {owner: 'tui', playback: {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false}, station: null, queue: []};
    const radio = await startRadioSession(async command => command.type === 'airplay-list'
      ? {ok: false, message: 'AirPlay setup required. Run radiocli setup --airplay, then radiocli doctor.', status, data: []}
      : {ok: true, message: 'Ready.', status});
    try {
      const service = new AgentRadioService({nodePath: '/node', cliPath: '/radiocli.js'}, store, undefined, source);
      await expect(service.listAirPlayDevices()).rejects.toThrow('setup --airplay');
      await expect(service.selectAirPlayDevice('saved')).rejects.toThrow('setup --airplay');
    } finally { await radio.close(); }
  });

  it.each(['ffmpeg', 'avahi-browse', 'sender'])('explains missing %s to standalone callers before discovery', async missing => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-airplay-missing-'));
    roots.push(root); vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    store.updateSettings({linuxAirPlayEnabled: true, agentControl: {...defaultAgentControlSettings, enabled: true}});
    const detect = backendInstall.detectPlaybackBackends;
    vi.spyOn(backendInstall, 'detectPlaybackBackends').mockImplementation(options => detect({...options,
      platform: 'linux', env: {}, release: '6.6',
      hasCommand: command => ['mpv', 'ffmpeg', 'avahi-browse'].includes(command) && command !== missing,
      hasAirPlaySender: () => missing !== 'sender'
    }));
    vi.spyOn(airPlayPolicyModule, 'airPlayPolicy').mockReturnValue({eligible: true, enabled: true, state: 'enabled', message: 'Enabled.'});
    const discovery = vi.spyOn(PlayerController.prototype, 'refreshAirPlayDevices').mockRejectedValue(new Error('Unexpected discovery.'));
    for (const source of ['agent', 'cli'] as const) {
      const service = new AgentRadioService({nodePath: '/node', cliPath: '/radiocli.js'}, store, undefined, source);
      await expect(service.listAirPlayDevices()).rejects.toThrow('radiocli doctor');
      await expect(service.selectAirPlayDevice('saved')).rejects.toThrow('radiocli doctor');
    }
    expect(discovery).not.toHaveBeenCalled();
  });

  it('blocks mutations while disabled and keeps repeated stop idempotent when enabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-service-'));
    roots.push(root);
    vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    const service = new AgentRadioService({nodePath: '/node', cliPath: '/radiocli.js'}, store);
    await expect(service.control({type: 'stop'})).rejects.toThrow('Agent control is disabled');
    await expect(service.status()).rejects.toThrow('Agent control is disabled');
    await expect(service.browse('favorites')).rejects.toThrow('Agent control is disabled');
    await expect(service.search('jazz')).rejects.toThrow('Agent control is disabled');
    expect(() => service.alarmList()).toThrow('Agent control is disabled');
    expect(() => service.stats()).toThrow('Agent control is disabled');
    expect(() => service.appearance()).toThrow('Agent control is disabled');

    store.updateSettings({agentControl: {...defaultAgentControlSettings, enabled: true}});
    const result = await service.control({type: 'stop'});
    expect(result).toMatchObject({ok: true, message: 'RadioCLI is already stopped.'});
  });

  it('transfers an active alarm into the existing player before stopping the runner', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-service-'));
    roots.push(root);
    vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore(join(root, 'library.json'));
    store.updateSettings({agentControl: {...defaultAgentControlSettings, enabled: true}});
    const station: Station = {id:'alarm-station',provider:'radio-browser',name:'Alarm Radio',tags:[]};
    const order: string[] = [];
    let status: RadioSessionStatus = {owner:'headless',playback:{backend:'mpv',state:'idle',volume:40,muted:false,ready:false},station:null,queue:[]};
    const radio = await startRadioSession(async command => {
      if (command.type === 'play') {
        order.push('interactive-playing');
        status = {...status,station:command.station,queue:command.queue??[command.station],playback:{backend:'mpv',state:'playing',volume:40,muted:false,ready:true}};
      }
      return {ok:true,message:'ok',status};
    });
    const alarm = await startActiveAlarmSession({alarmId:'alarm-1',scheduledAt:'2030-01-01T08:00:00.000Z',stationName:station.name,station,startedAt:'2030-01-01T08:00:01.000Z',state:'playing'},{onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),onHandoff:()=>{order.push('alarm-stopped');}});
    try {
      const service = new AgentRadioService({nodePath:'/node',cliPath:'/radiocli.js'},store);
      await service.alarmControl({action:'handoff',alarmId:'alarm-1'});
      expect(order).toEqual(['interactive-playing','alarm-stopped']);
    } finally { await alarm.close(); await radio.close(); }
  });
});
