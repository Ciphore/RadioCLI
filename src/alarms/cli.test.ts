import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {JsonLibraryStore} from '../storage/store.js';
import {runAlarmCommand,alarmRuntimeSettings,alarmUsage,parseActiveSelectors,rejectAt,runnerPowerActive,enforcePreviewDeadline,validatePreviewResult} from './cli.js';
import {SchedulerService,type SchedulerAdapter} from './scheduler.js';

const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('alarm CLI',()=>{
  it('adds and synchronizes a recurring alarm without invoking a real OS command',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-cli-alarm-'));roots.push(root);const store=new JsonLibraryStore(join(root,'library.json'));
    store.addImported([{id:'jazz',provider:'playlist',name:'Jazz',tags:[],streamUrl:'https://example.test/jazz'}]);
    const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'test'}),install:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),status:vi.fn(async()=>({installed:true,healthy:true,message:'test'}))};
    const scheduler=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record:vi.fn(),list:vi.fn(()=>[])} as never);vi.spyOn(console,'log').mockImplementation(()=>{});
    await runAlarmCommand(['add','--station','playlist:jazz','--time','06:30','--days','weekdays','--timezone','America/Los_Angeles','--volume','35','--fade','30s','--stop-after','1h','--wake'],{store,scheduler});
    const alarm=store.listAlarms()[0]!;expect(alarm.schedule).toEqual({type:'recurring',time:'06:30',weekdays:[1,2,3,4,5],timezone:'America/Los_Angeles'});expect(alarm.playback).toMatchObject({volume:35,fadeSeconds:30,stopAfterMinutes:60});expect(adapter.install).toHaveBeenCalled();
    expect(alarmRuntimeSettings(store.snapshot().settings,alarm,['mpv'])).toMatchObject({volume:0,preferredBackend:'mpv'});
    expect(alarmRuntimeSettings(store.snapshot().settings,alarm,['ffplay'])).toMatchObject({volume:35,preferredBackend:'auto'});
    await runAlarmCommand(['edit',alarm.id,'--timezone','America/New_York'],{store,scheduler});
    expect(store.getAlarm(alarm.id)?.schedule).toEqual({type:'recurring',time:'06:30',weekdays:[1,2,3,4,5],timezone:'America/New_York'});
    await expect(runAlarmCommand(['edit',alarm.id,'--bogus','x'],{store,scheduler})).rejects.toThrow(/unknown/i);
    await expect(runAlarmCommand(['add','--station','playlist:jazz','--once','2030-01-01T08:00:30Z'],{store,scheduler})).rejects.toThrow(/minute/i);
  });

  it('keeps internal runner commands out of public usage while disclosing active selectors',()=>{expect(alarmUsage()).not.toContain('internal-run');expect(alarmUsage()).toContain('--alarm <id> --occurrence <ISO>');});
  it('parses explicit concurrent-session selectors and rejects malformed selectors',()=>{expect(parseActiveSelectors(['--alarm','a','--occurrence','2030-01-01T08:00:00Z'])).toEqual({alarmId:'a',occurrenceAt:'2030-01-01T08:00:00.000Z'});expect(()=>parseActiveSelectors(['--unknown','a'])).toThrow();});
  it('enforces the preview global deadline even when an operation never settles',async()=>{vi.useFakeTimers();try{const bounded=Promise.race([new Promise<never>(()=>{}),rejectAt(Date.now()+10_000,'preview timed out')]);const rejected=expect(bounded).rejects.toThrow('preview timed out');await vi.advanceTimersByTimeAsync(10_000);await rejected;}finally{vi.useRealTimers();}});
  it('correlates power health to the exact active occurrence',()=>{const entries=[{alarmId:'a',occurrenceAt:'2030-01-01T08:00:00Z',component:'power',healthy:true,active:true}];expect(runnerPowerActive([{alarmId:'a',scheduledAt:'2030-01-01T09:00:00Z'}],entries)).toBe(false);expect(runnerPowerActive([{alarmId:'a',scheduledAt:'2030-01-01T08:00:00Z'}],entries)).toBe(true);});
  it('interrupts a stalled preview and awaits its cleanup before returning',async()=>{vi.useFakeTimers();try{let finish:()=>void=()=>{};const runner=new Promise<void>(resolve=>{finish=resolve;});const stop=vi.fn(async()=>{});const preview=enforcePreviewDeadline(runner,()=>{queueMicrotask(finish);},stop,10_000,1_500);const rejected=expect(preview).rejects.toThrow(/10-second playback safety limit/);await vi.advanceTimersByTimeAsync(10_000);await rejected;expect(stop).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}});
  it('keeps the primary timeout alive for a never-settling runner',async()=>{vi.useFakeTimers();try{const preview=enforcePreviewDeadline(new Promise<never>(()=>{}),vi.fn(),async()=>{},10_000,1_500);const rejected=expect(preview).rejects.toThrow(/10-second playback safety limit/);await vi.advanceTimersByTimeAsync(11_500);await rejected;}finally{vi.useRealTimers();}});
  it('bounds cleanup when player stop never settles',async()=>{vi.useFakeTimers();try{const preview=enforcePreviewDeadline(new Promise<never>(()=>{}),vi.fn(),()=>new Promise<never>(()=>{}),10_000,1_500);const rejected=expect(preview).rejects.toThrow(/cleanup was given 1500ms/);await vi.advanceTimersByTimeAsync(10_000);await vi.advanceTimersByTimeAsync(1_500);await rejected;}finally{vi.useRealTimers();}});
  it('does not report a missed preview as complete',()=>{expect(()=>validatePreviewResult({status:'missed'})).toThrow(/did not play/i);expect(()=>validatePreviewResult({status:'played'})).not.toThrow();});
});
