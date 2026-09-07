import {describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readdirSync,rmSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Alarm,Station} from '../types.js';
import type {ActiveAlarmServer} from './active-session.js';
import type {InhibitorLease} from './inhibitor.js';
import {acquireOccurrenceLock,pruneCompletedOccurrenceLocks,runAlarm,type AlarmRunnerDeps} from './runner.js';
import {createSchedulerAdapter,SchedulerService} from './scheduler.js';

const station:Station={id:'main',provider:'radio-browser',name:'Main',tags:[]};
const fallback:Station={id:'backup',provider:'radio-browser',name:'Backup',tags:[]};
const alarm:Alarm={id:'a',label:'Wake',enabled:true,station,schedule:{type:'once',at:'2030-01-01T08:00:00Z'},playback:{volume:40,fadeSeconds:0,stopAfterMinutes:1,fallbackStation:fallback},reliability:{missedRunGraceMinutes:10,wakeIfSupported:false},createdAt:'x',updatedAt:'x'};
const scheduledAt='2030-01-01T08:00:00Z';

function deps(overrides:Partial<AlarmRunnerDeps>={}):AlarmRunnerDeps{
  const current={...alarm};
  return {now:()=>new Date('2030-01-01T08:01:00Z'),store:{getAlarm:vi.fn(()=>current),recordAlarmOutcome:vi.fn(),toggleAlarm:vi.fn(),snoozeAlarm:vi.fn(),addRecent:vi.fn(),startListeningSession:vi.fn(),checkpointActiveListeningSession:vi.fn(),finishActiveListeningSession:vi.fn()},providers:{resolve:vi.fn(async(s:Station)=>({url:`https://${s.id}`}))},player:{play:vi.fn(async()=>{}),stop:vi.fn(async()=>{}),setVolume:vi.fn(async()=>({ok:true})),getState:vi.fn(()=>({backend:'mpv'}))},scheduler:{sync:vi.fn(async()=>null)},inhibitor:{status:vi.fn(()=>({supported:true,active:false,message:'ok'})),acquire:vi.fn(async()=>({release:vi.fn(async()=>{})}))},acquireLock:vi.fn(()=>()=>{}),createSession:vi.fn(async(_s,h)=>{queueMicrotask(()=>h.onDismiss());return{update:vi.fn(),close:vi.fn(async()=>{})};}),wait:vi.fn(async()=>{}),...overrides};
}

describe('alarm runner',()=>{
  it('plays headlessly, inhibits sleep, records activity, and cleans up',async()=>{
    const d=deps();const result=await runAlarm('a',scheduledAt,d);
    expect(d.player.play).toHaveBeenCalledWith(station,'https://main');
    expect(d.inhibitor.acquire).toHaveBeenCalled();
    expect(d.store.addRecent).toHaveBeenCalledWith(station);
    expect(d.store.recordAlarmOutcome).toHaveBeenCalledWith('a',expect.objectContaining({status:'dismissed'}),{clearNextOverride:true});
    expect(d.scheduler.sync).toHaveBeenCalled();
    expect(result.status).toBe('dismissed');
  });

  it('raises system output before playback and restores it after the alarm',async()=>{const events:string[]=[];const release=vi.fn(async()=>{events.push('restore-output');});const base=deps();const play=vi.fn(async()=>{events.push('play');});const d=deps({systemVolume:{acquireMinimum:vi.fn(async volume=>{events.push(`system-${volume}`);return{message:'raised',release};})},player:{...base.player,play}});await runAlarm('a',scheduledAt,d);expect(events.indexOf('system-40')).toBeLessThan(events.indexOf('play'));expect(events).toContain('restore-output');expect(release).toHaveBeenCalledOnce();});

  it('continues at player volume when system output control is unavailable',async()=>{const record=vi.fn();const d=deps({systemVolume:{acquireMinimum:vi.fn(async()=>{throw new Error('no output control');})},health:{record} as never});expect((await runAlarm('a',scheduledAt,d)).status).toBe('dismissed');expect(d.player.play).toHaveBeenCalled();expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'runner',healthy:false,message:expect.stringMatching(/system output.*no output control/i)}));});

  it('opens TUI controls after publishing the authenticated active session',async()=>{const openControls=vi.fn(async()=>{});const d=deps({openControls});await runAlarm('a',scheduledAt,d);expect(openControls).toHaveBeenCalledWith(expect.objectContaining({alarmId:'a',stationName:'Main',state:'playing'}));});

  it('keeps playing when automatic terminal controls cannot open',async()=>{const record=vi.fn();const d=deps({openControls:vi.fn(async()=>{throw new Error('no terminal');}),health:{record} as never});expect((await runAlarm('a',scheduledAt,d)).status).toBe('dismissed');await Promise.resolve();expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'runner',healthy:false,message:expect.stringMatching(/controls could not open.*no terminal/i)}));});

  it('retries primary once then uses only the explicit fallback',async()=>{
    const play=vi.fn().mockRejectedValueOnce(new Error('bad')).mockRejectedValueOnce(new Error('bad')).mockResolvedValue(undefined);
    const d=deps({player:{play,stop:vi.fn(async()=>{}),setVolume:vi.fn(async()=>({ok:true})),getState:vi.fn(()=>({backend:'mpv'}))}});
    await runAlarm('a',scheduledAt,d);
    expect(play.mock.calls.map(call=>(call[0] as Station).id)).toEqual(['main','main','backup']);
  });

  it('does not run a duplicate occurrence',async()=>{
    const d=deps({acquireLock:vi.fn(()=>null)});const result=await runAlarm('a',scheduledAt,d);
    expect(result.duplicate).toBe(true);expect(d.player.play).not.toHaveBeenCalled();expect(d.scheduler.sync).toHaveBeenCalled();
  });

  it('fades mpv without changing application settings',async()=>{
    const setVolume=vi.fn(async()=>({ok:true}));const fading={...alarm,playback:{...alarm.playback,fadeSeconds:4}};
    const d=deps({store:{...deps().store,getAlarm:vi.fn(()=>fading)},player:{play:vi.fn(async()=>{}),stop:vi.fn(async()=>{}),setVolume,getState:vi.fn(()=>({backend:'mpv'}))},createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})}))});
    await runAlarm('a',scheduledAt,d);expect((setVolume.mock.calls as unknown as Array<[number]>).map(call=>call[0])).toEqual([0,20,40]);
  });

  it('preserves a newly-created snooze override and leaves a one-time alarm enabled',async()=>{
    const d=deps({createSession:vi.fn(async(_s,h)=>{queueMicrotask(()=>h.onSnooze(10));return{update:vi.fn(),close:vi.fn(async()=>{})};})});
    await runAlarm('a',scheduledAt,d);expect(d.store.snoozeAlarm).toHaveBeenCalled();expect(d.store.recordAlarmOutcome).toHaveBeenCalledWith('a',expect.anything(),{clearNextOverride:false});expect(d.store.toggleAlarm).not.toHaveBeenCalled();
  });

  it('starts limited backends at target volume without claiming a fade',async()=>{
    const setVolume=vi.fn(async()=>({ok:false,message:'unsupported'}));const fading={...alarm,playback:{...alarm.playback,fadeSeconds:30}};
    const d=deps({store:{...deps().store,getAlarm:vi.fn(()=>fading)},player:{play:vi.fn(async()=>{}),stop:vi.fn(async()=>{}),setVolume,getState:vi.fn(()=>({backend:'ffplay'}))}});
    await runAlarm('a',scheduledAt,d);expect(setVolume).toHaveBeenCalledTimes(1);expect(setVolume).toHaveBeenCalledWith(40);
  });

  it('continues audible playback when optional sleep inhibition fails',async()=>{const d=deps({inhibitor:{status:vi.fn(()=>({supported:false,active:false,message:'no'})),acquire:vi.fn(async()=>{throw new Error('no inhibitor');})}});const result=await runAlarm('a',scheduledAt,d);expect(d.player.play).toHaveBeenCalled();expect(result.status).toBe('dismissed');});

  it('persists loss of an inhibitor helper without stopping audio',async()=>{const record=vi.fn();const d=deps({health:{record} as never,inhibitor:{status:vi.fn(()=>({supported:true,active:false,message:'ok'})),acquire:vi.fn(async()=>({release:vi.fn(async()=>{}),unexpectedExit:Promise.resolve(new Error('helper died'))}))}});await runAlarm('a',scheduledAt,d);await Promise.resolve();expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'power',healthy:false}));});

  it('rejects stale native tasks without playback or disabling an edited one-time alarm',async()=>{const d=deps();const result=await runAlarm('a','2030-01-01T08:02:00Z',d);expect(result.status).toBe('missed');expect(result.message).toMatch(/stale/i);expect(d.player.play).not.toHaveBeenCalled();expect(d.store.toggleAlarm).not.toHaveBeenCalled();});

  it('rejects machine-local timestamps from internal scheduler invocations',async()=>{const d=deps();await expect(runAlarm('a','2030-01-01T08:00:00',d)).rejects.toThrow(/absolute/i);expect(d.player.play).not.toHaveBeenCalled();});

  it('does not disable a valid one-time alarm when launched early',async()=>{const d=deps({now:()=>new Date('2030-01-01T07:59:00Z')});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('failed');expect(d.store.toggleAlarm).not.toHaveBeenCalled();});

  it('records a valid but overdue occurrence as missed and disables one-time alarms',async()=>{const d=deps({now:()=>new Date('2030-01-01T08:20:00Z')});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('missed');expect(d.store.toggleAlarm).toHaveBeenCalledWith('a',false);});

  it('records normal stop-after completion as played',async()=>{const d=deps({createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})}))});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('played');expect(d.store.toggleAlarm).toHaveBeenCalledWith('a',false);});

  it('does not disable an alarm changed to recurring while its one-time run finishes',async()=>{const recurring={...alarm,schedule:{type:'recurring' as const,time:'08:00',weekdays:[1,2,3,4,5,6,7] as const,timezone:'UTC'},updatedAt:'later'};const base=deps();const getAlarm=vi.fn().mockReturnValueOnce(alarm).mockReturnValue(recurring);const d=deps({store:{...base.store,getAlarm},createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})}))});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('played');expect(d.store.toggleAlarm).not.toHaveBeenCalled();expect(d.scheduler.sync).toHaveBeenCalledWith(recurring);});

  it('allows ordinary native dispatch latency when missed grace is zero',async()=>{const zeroGrace={...alarm,reliability:{...alarm.reliability,missedRunGraceMinutes:0}};const d=deps({now:()=>new Date('2030-01-01T08:00:10Z'),store:{...deps().store,getAlarm:vi.fn(()=>zeroGrace)}});expect((await runAlarm('a',scheduledAt,d)).status).toBe('dismissed');});

  it('backs off before retrying a temporarily unavailable provider',async()=>{const resolve=vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({url:'https://main'});const wait=vi.fn(async()=>{});const d=deps({providers:{resolve},wait});expect((await runAlarm('a',scheduledAt,d)).status).toBe('dismissed');expect(wait).toHaveBeenCalledWith(500);expect(resolve).toHaveBeenCalledTimes(2);});

  it('cancels during retry backoff without another resolve or playback',async()=>{const resolve=vi.fn(async()=>{throw new Error('temporary');});const wait=vi.fn(()=>new Promise<never>(()=>{}));const d=deps({providers:{resolve},wait,subscribeSignals:handler=>{setTimeout(handler,0);return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(resolve).toHaveBeenCalledTimes(1);expect(d.player.play).not.toHaveBeenCalled();});

  it('skips retry and backoff when provider failure exhausts the grace deadline',async()=>{let current=new Date('2030-01-01T08:00:10Z');const zeroGrace={...alarm,reliability:{...alarm.reliability,missedRunGraceMinutes:0}};const resolve=vi.fn(async()=>{current=new Date('2030-01-01T08:00:31Z');throw new Error('late');});const wait=vi.fn(async()=>{});const d=deps({now:()=>current,store:{...deps().store,getAlarm:vi.fn(()=>zeroGrace)},providers:{resolve},wait});expect((await runAlarm('a',scheduledAt,d)).status).toBe('failed');expect(resolve).toHaveBeenCalledTimes(1);expect(wait).not.toHaveBeenCalled();});

  it('does not let occurrence-lock cleanup failure replace a successful result',async()=>{const record=vi.fn();const d=deps({acquireLock:vi.fn(()=>()=>{throw new Error('disk full');}),health:{record} as never});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'runner',healthy:false,message:expect.stringMatching(/lock cleanup/i)}));});

  it('reconciles the next daily occurrence before keep-playing can run indefinitely',async()=>{const recurring:Alarm={...alarm,schedule:{type:'recurring',time:'08:00',weekdays:[1,2,3,4,5,6,7],timezone:'UTC'}};let signal:()=>void=()=>{};const sync=vi.fn(async()=>null);const d=deps({store:{...deps().store,getAlarm:vi.fn(()=>recurring)},scheduler:{sync},createSession:vi.fn(async(_status,handlers)=>{handlers.onKeepPlaying();return{update:vi.fn(),close:vi.fn(async()=>{})};}),wait:vi.fn(()=>new Promise<never>(()=>{})),subscribeSignals:handler=>{signal=handler;return vi.fn();}});const running=runAlarm('a',scheduledAt,d);for(let attempt=0;attempt<10&&sync.mock.calls.length===0;attempt+=1)await Promise.resolve();expect(sync).toHaveBeenCalledWith(recurring);signal();await running;});

  it('hands playback to the interactive player without restoring the alarm output level',async()=>{const release=vi.fn(async()=>{});const d=deps({systemVolume:{acquireMinimum:vi.fn(async()=>({message:'raised',release}))},createSession:vi.fn(async(status,handlers)=>{expect(status.station).toEqual(station);return{update:vi.fn(change=>{if(change.state==='playing')queueMicrotask(()=>handlers.onHandoff?.());}),close:vi.fn(async()=>{})};})});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('played');expect(result.message).toContain('Handed off');expect(release).not.toHaveBeenCalled();expect(d.player.stop).toHaveBeenCalled();});

  it('claims the alarm before resolving and preempts interactive playback before raising output or tuning',async()=>{const events:string[]=[];const base=deps();const d=deps({providers:{resolve:vi.fn(async()=>{events.push('resolve');return{url:'https://main'};})},preemptInteractivePlayback:vi.fn(async()=>{events.push('preempt');}),systemVolume:{acquireMinimum:vi.fn(async()=>{events.push('system-volume');return{message:'raised',release:vi.fn(async()=>{})};})},player:{...base.player,play:vi.fn(async()=>{events.push('play');})},createSession:vi.fn(async(status,handlers)=>{events.push(`claim-${status.state}`);return{update:vi.fn(change=>{events.push(`update-${change.state}`);queueMicrotask(()=>handlers.onDismiss());}),close:vi.fn(async()=>{})};})});await runAlarm('a',scheduledAt,d);expect(events).toEqual(['claim-starting','resolve','preempt','system-volume','play','update-playing']);});

  it('reconciles the next daily occurrence before a stop-after longer than its interval',async()=>{const recurring:Alarm={...alarm,schedule:{type:'recurring',time:'08:00',weekdays:[1,2,3,4,5,6,7],timezone:'UTC'},playback:{...alarm.playback,stopAfterMinutes:2880}};let signal:()=>void=()=>{};const sync=vi.fn(async()=>null);const d=deps({store:{...deps().store,getAlarm:vi.fn(()=>recurring)},scheduler:{sync},createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})})),wait:vi.fn(()=>new Promise<never>(()=>{})),subscribeSignals:handler=>{signal=handler;return vi.fn();}});const running=runAlarm('a',scheduledAt,d);for(let attempt=0;attempt<10&&sync.mock.calls.length===0;attempt+=1)await Promise.resolve();expect(sync).toHaveBeenCalledWith(recurring);signal();await running;});

  it('does not enter indefinite recurring playback when prompt reconciliation fails',async()=>{const recurring:Alarm={...alarm,schedule:{type:'recurring',time:'08:00',weekdays:[1,2,3,4,5,6,7],timezone:'UTC'}};const sync=vi.fn().mockRejectedValue(new Error('scheduler down'));const d=deps({store:{...deps().store,getAlarm:vi.fn(()=>recurring)},scheduler:{sync}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('failed');expect(result.message).toMatch(/scheduler down/);expect(d.player.play).not.toHaveBeenCalled();expect(sync).toHaveBeenCalledTimes(2);});

  it('does not boot out its current launchd job before playback while installing the next occurrence',async()=>{const events:string[]=[];const recurring:Alarm={...alarm,schedule:{type:'recurring',time:'08:00',weekdays:[1,2,3,4,5,6,7],timezone:'UTC'}};const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:()=>{events.push('installed-next');},removeFile:vi.fn(),run:vi.fn(async(_command,args)=>{events.push(String(args[0]));return{code:args[0]==='print'?1:0,stdout:'',stderr:''};}),env:{}});const scheduler=new SchedulerService(adapter,()=>new Date('2030-01-01T08:01:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[]),remove:vi.fn()} as never);const base=deps();const player={...base.player,play:vi.fn(async()=>{events.push('play');})};const d=deps({store:{...base.store,getAlarm:vi.fn(()=>recurring)},scheduler,player});expect((await runAlarm('a',scheduledAt,d)).status).toBe('dismissed');expect(events).toContain('installed-next');expect(events.indexOf('bootout')).toBeGreaterThan(events.indexOf('play'));});

  it('records launchd completion cleanup failure without replacing the playback result',async()=>{const record=vi.fn();const scheduler={sync:vi.fn(async()=>null),completeOccurrence:vi.fn(async()=>{throw new Error('still loaded');})};const d=deps({scheduler,health:{record} as never});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'scheduler',healthy:false,message:expect.stringMatching(/cleanup failed.*still loaded/i)}));});

  it('subscribes before provider resolution and cleans up a signal during resolve',async()=>{const d=deps({providers:{resolve:vi.fn(()=>new Promise<never>(()=>{}))},subscribeSignals:handler=>{queueMicrotask(handler);return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(d.player.play).not.toHaveBeenCalled();expect(d.player.stop).toHaveBeenCalled();expect(d.scheduler.sync).toHaveBeenCalled();});

  it('does not hang when signaled during a stalled player readiness check',async()=>{const player={play:vi.fn(()=>new Promise<never>(()=>{})),stop:vi.fn(async()=>{}),setVolume:vi.fn(async()=>({ok:true})),getState:vi.fn(()=>({backend:'mpv'}))};const d=deps({player,subscribeSignals:handler=>{setTimeout(handler,0);return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(player.stop).toHaveBeenCalled();expect(d.scheduler.sync).toHaveBeenCalled();});

  it('stops playback again when a canceled readiness operation succeeds late',async()=>{let finish:()=>void=()=>{};let signal=()=>{};let active=false;const stop=vi.fn(async()=>{active=false;});const play=vi.fn(()=>{setTimeout(signal,0);return new Promise<void>(resolve=>{finish=()=>{active=true;resolve();};});});const d=deps({player:{play,stop,setVolume:vi.fn(async()=>({ok:true})),getState:vi.fn(()=>({backend:'mpv'}))},createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})})),subscribeSignals:handler=>{signal=handler;return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');expect(stop).toHaveBeenCalledTimes(2);finish();await Promise.resolve();await Promise.resolve();expect(stop).toHaveBeenCalledTimes(3);expect(active).toBe(false);});

  it('closes a control server that finishes starting after cancellation',async()=>{let finish:(server:ActiveAlarmServer)=>void=()=>{};const close=vi.fn(async()=>{});const createSession:AlarmRunnerDeps['createSession']=vi.fn(()=>new Promise<ActiveAlarmServer>(resolve=>{finish=resolve;}));const d=deps({createSession,subscribeSignals:handler=>{setTimeout(handler,0);return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');finish({update:vi.fn(),close});await Promise.resolve();await Promise.resolve();expect(close).toHaveBeenCalled();});

  it('releases an inhibitor that finishes acquiring after cancellation',async()=>{let finish:(lease:InhibitorLease)=>void=()=>{};let signal=()=>{};const release=vi.fn(async()=>{});const acquire=vi.fn(()=>{setTimeout(signal,0);return new Promise<InhibitorLease>(resolve=>{finish=resolve;});});const d=deps({inhibitor:{status:vi.fn(()=>({supported:true,active:false,message:'ok'})),acquire},createSession:vi.fn(async()=>({update:vi.fn(),close:vi.fn(async()=>{})})),subscribeSignals:handler=>{signal=handler;return vi.fn();}});const result=await runAlarm('a',scheduledAt,d);expect(result.status).toBe('dismissed');finish({release});await Promise.resolve();await Promise.resolve();expect(release).toHaveBeenCalled();});

  it('prunes old completed idempotency markers',()=>{const root=mkdtempSync(join(tmpdir(),'radio-lock-'));try{const release=acquireOccurrenceLock('a',scheduledAt,root)!;release();const locks=join(root,'locks');const name=readdirSync(locks)[0]!;const completed=join(locks,name,'completed');utimesSync(completed,new Date(0),new Date(0));expect(pruneCompletedOccurrenceLocks(root,1000,Date.now())).toBe(1);}finally{rmSync(root,{recursive:true,force:true});}});
});
