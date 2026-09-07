import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JsonLibraryStore} from '../storage/store.js';
import {defaultAgentControlSettings} from '../types.js';
import type {Station} from '../types.js';
import {startActiveAlarmSession} from '../alarms/active-session.js';
import {startRadioSession, type RadioSessionStatus} from './session.js';
import {AgentRadioService} from './service.js';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('agent radio service policy', () => {
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
