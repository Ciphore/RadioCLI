import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {platformPaths} from '../platform/paths.js';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Alarm,AlarmRunRecord,PlaybackState,ResolvedStream,Station} from '../types.js';
import type {PlaybackControlResult} from '../player/player-controller.js';
import type {SchedulerService} from './scheduler.js';
import type {PowerInhibitor} from './inhibitor.js';
import {assessScheduledOccurrence,NATIVE_DISPATCH_TOLERANCE_MS,nextOccurrenceForAlarm} from './schedule.js';
import {startActiveAlarmSession,type ActiveAlarmHandlers,type ActiveAlarmServer,type ActiveAlarmStatus} from './active-session.js';
import type {AlarmRuntimeHealthStore} from './runtime-health.js';
import type {SystemVolumeController,SystemVolumeLease} from './system-volume.js';
import type {AlarmTerminalLaunchResult} from './terminal-launcher.js';

type RunnerStore={
  getAlarm(id:string):Alarm|undefined;
  recordAlarmOutcome(id:string,outcome:AlarmRunRecord,options?:{clearNextOverride?:boolean}):unknown;
  toggleAlarm(id:string,enabled?:boolean):unknown;
  snoozeAlarm(id:string,until:Date):unknown;
  addRecent(station:Station):unknown;
  startListeningSession(station:Station,at?:Date):unknown;
  checkpointActiveListeningSession(at?:Date):unknown;
  finishActiveListeningSession(at?:Date):unknown;
};
type RunnerPlayer={play(station:Station,url:string,options?:{signal?:AbortSignal}):Promise<void>;stop():Promise<void>;setVolume(volume:number):Promise<PlaybackControlResult>;getState():Partial<PlaybackState>;onChange?(listener:(state:PlaybackState)=>void):()=>void};
type RunnerProvider={resolve(station:Station,options?:{signal?:AbortSignal}):Promise<ResolvedStream>};
type RunnerScheduler=Pick<SchedulerService,'sync'> & Partial<Pick<SchedulerService,'syncClaimed'|'completeOccurrence'>>;
export type AlarmRunnerDeps={
  now():Date; store:RunnerStore; providers:RunnerProvider; player:RunnerPlayer; scheduler:RunnerScheduler; inhibitor:PowerInhibitor;
  acquireLock(alarmId:string,scheduledAt:string):((completed?:boolean)=>void)|null;
  createSession(status:ActiveAlarmStatus,handlers:ActiveAlarmHandlers):Promise<ActiveAlarmServer>;
  openControls?(status:ActiveAlarmStatus):Promise<AlarmTerminalLaunchResult|void>;
  preemptInteractivePlayback?():Promise<void>;
  wait(milliseconds:number):Promise<void>;
  subscribeSignals?(handler:()=>void):()=>void;
  health?:AlarmRuntimeHealthStore;
  systemVolume?:SystemVolumeController;
};
export type AlarmRunResult={status?:AlarmRunRecord['status'];message?:string;duplicate?:boolean};

export async function runAlarm(alarmId:string,scheduledAtText:string,deps:AlarmRunnerDeps):Promise<AlarmRunResult>{
  if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAtText))throw new Error('Scheduled alarm occurrence must be an absolute date.');
  const scheduledAt=new Date(scheduledAtText);if(!Number.isFinite(scheduledAt.getTime()))throw new Error('Scheduled alarm occurrence must be an absolute date.');
  const releaseLock=deps.acquireLock(alarmId,scheduledAt.toISOString());if(!releaseLock){const current=deps.store.getAlarm(alarmId);if(current)try{await deps.scheduler.sync(current);}catch{}return{duplicate:true,message:'This alarm occurrence is already running or completed.'};}
  let alarm=deps.store.getAlarm(alarmId);let outcome:AlarmRunRecord|undefined;let session:ActiveAlarmServer|undefined;let lease:Awaited<ReturnType<PowerInhibitor['acquire']>>|undefined;let systemVolumeLease:SystemVolumeLease|undefined;let listening=false;let historyStarted=false;let firedAt:Date|undefined;
  const runnerWarnings=new Set<string>();
  const recordRunnerWarning=(message:string)=>{runnerWarnings.add(message);try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:false,active:listening,message:[...runnerWarnings].join(' ')});}catch{}};
  let preserveNextOverride=false;
  let preserveSystemVolume=false;
  let handoffOutput:Promise<void>|undefined;
  let validTerminalOccurrence=false;
  let completeLock=true;
  const tuneAbort=new AbortController();
  let signalReceived=false;let resolveEarlySignal:()=>void=()=>{};let onPlaybackSignal:()=>void=()=>{};const earlySignal=new Promise<void>(resolve=>{resolveEarlySignal=resolve;});const unsubscribeSignals=deps.subscribeSignals?.(()=>{signalReceived=true;tuneAbort.abort();resolveEarlySignal();onPlaybackSignal();void deps.player.stop().catch(()=>undefined);});
  const finish=(status:AlarmRunRecord['status'],message?:string):AlarmRunRecord=>({status,scheduledAt:scheduledAt.toISOString(),...(firedAt?{firedAt:firedAt.toISOString()}:{}),finishedAt:deps.now().toISOString(),...(message?{message}:{})});
  let action:'dismissed'|'snoozed'|'handoff'|'timeout'|'signal'|'backend-ended'|undefined;let keepPlaying=false;let resolveAction:(value:'dismissed'|'snoozed'|'handoff'|'signal'|'backend-ended')=>void=()=>{};
  const actionPromise=new Promise<'dismissed'|'snoozed'|'handoff'|'signal'|'backend-ended'>(resolve=>{resolveAction=resolve;});
  let backendMessage:string|undefined;
  let playbackStarted=false;let backendEndedAt:Date|undefined;
  const unsubscribePlayer=deps.player.onChange?.(state=>{
    if((!listening&&!playbackStarted)||action||!['error','stopped','idle'].includes(state.state))return;
    backendMessage=state.message??'Alarm stream ended before its scheduled stop.';
    backendEndedAt=deps.now();
    action='backend-ended';resolveAction('backend-ended');resolveEarlySignal();
  });
  try{
    if(!alarm||!alarm.enabled)return{message:'Alarm is missing or disabled.'};
    const expected=nextExpectedOccurrence(alarm,scheduledAt);if(!expected||Math.abs(expected.getTime()-scheduledAt.getTime())>1000){outcome=finish('missed','Ignored a stale native task whose occurrence no longer matches this alarm.');return{status:'missed',message:outcome.message};}
    const assessment=assessScheduledOccurrence(scheduledAt,deps.now(),alarm.reliability.missedRunGraceMinutes);
    if(assessment==='pending'){completeLock=false;outcome=finish('failed','Scheduler launched the alarm before its occurrence.');return{status:outcome.status,message:outcome.message};}
    validTerminalOccurrence=true;
    if(assessment==='missed'){outcome=finish('missed','Alarm was outside its missed-run grace window.');return{status:outcome.status,message:outcome.message};}
    const claimingStatus:ActiveAlarmStatus={alarmId,scheduledAt:scheduledAt.toISOString(),stationName:alarm.station.name,station:alarm.station,startedAt:deps.now().toISOString(),state:'starting'};
    const creatingSession=deps.createSession(claimingStatus, {
      onDismiss:()=>{tuneAbort.abort();action='dismissed';resolveAction('dismissed');resolveEarlySignal();},
      onSnooze:async minutes=>{await deps.store.snoozeAlarm(alarmId,new Date(deps.now().getTime()+minutes*60_000));preserveNextOverride=true;tuneAbort.abort();action='snoozed';resolveAction('snoozed');resolveEarlySignal();},
      onKeepPlaying:()=>{keepPlaying=true;session?.update({keepPlaying:true});},
      onHandoff:async()=>{if(!listening)throw new Error('Alarm playback is still starting.');handoffOutput=(systemVolumeLease?.release({preserve:true})??Promise.resolve()).then(()=>{preserveSystemVolume=true;});await handoffOutput;action='handoff';resolveAction('handoff');}
    });void creatingSession.then(created=>{if(signalReceived||action)void created.close().catch(()=>undefined);}).catch(()=>{});const created=await Promise.race([creatingSession.then(value=>({value})),earlySignal.then(()=>({signal:true as const}))]);if('signal'in created){outcome=finish('dismissed','Alarm interrupted while local controls were starting.');return{status:'dismissed',message:outcome.message};}session=created.value;
    const claimed=deps.store.getAlarm(alarmId);if(claimed?.enabled&&claimed.schedule.type==='recurring'){if(deps.scheduler.syncClaimed)await deps.scheduler.syncClaimed(claimed,scheduledAt);else await deps.scheduler.sync(claimed);}
    let resolvedStation=alarm.station;let lastError:unknown;
    let interactivePreempted=false;let outputPrepared=false;
    const candidates=[alarm.station,alarm.station,alarm.playback.fallbackStation].filter((item):item is Station=>Boolean(item));
    for(const [candidateIndex,candidate] of candidates.entries()){
      try{const resolved=await Promise.race([deps.providers.resolve(candidate,{signal:tuneAbort.signal}).then(stream=>({stream})),earlySignal.then(()=>({signal:true as const}))]);if('signal'in resolved){outcome=finish('dismissed','Alarm interrupted before playback started.');return{status:'dismissed',message:outcome.message};}if(!interactivePreempted){interactivePreempted=true;try{await deps.preemptInteractivePlayback?.();}catch(error){deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:false,active:true,message:`Alarm continued after interactive playback could not be stopped cleanly: ${errorMessage(error)}`});}}tuneAbort.signal.throwIfAborted();if(!outputPrepared){outputPrepared=true;if(deps.systemVolume)try{systemVolumeLease=await deps.systemVolume.acquireMinimum(alarm.playback.volume);deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:true,active:true,message:systemVolumeLease.message});}catch(error){deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:false,active:false,message:`Alarm will use player volume, but system output could not be raised: ${errorMessage(error)}`});}}tuneAbort.signal.throwIfAborted();const playPromise=deps.player.play(candidate,resolved.stream.url,{signal:tuneAbort.signal});const tuned=await Promise.race([playPromise.then(()=>({played:true as const})),earlySignal.then(()=>({signal:true as const}))]);if('signal'in tuned||signalReceived){void playPromise.then(()=>deps.player.stop()).catch(()=>undefined);outcome=finish('dismissed','Alarm interrupted while playback was starting.');return{status:'dismissed',message:outcome.message};}resolvedStation=candidate;lastError=undefined;break;}catch(error){lastError=error;}
      if(candidateIndex<candidates.length-1){const remaining=scheduledAt.getTime()+Math.max(NATIVE_DISPATCH_TOLERANCE_MS,alarm.reliability.missedRunGraceMinutes*60_000)-deps.now().getTime();if(remaining<=0)break;const backoff=await Promise.race([deps.wait(Math.min(remaining,1_000,500*(candidateIndex+1))).then(()=>({waited:true as const})),earlySignal.then(()=>({signal:true as const}))]);if('signal'in backoff){outcome=finish('dismissed','Alarm interrupted during station retry backoff.');return{status:'dismissed',message:outcome.message};}}
    }
    if(lastError)throw lastError;
    playbackStarted=true;
    const initialPlayback=deps.player.getState();
    if(initialPlayback.state&&['error','stopped','idle'].includes(initialPlayback.state))throw new Error(initialPlayback.message??'Alarm stream ended before playback could be published.');
    firedAt=deps.now();
    try{const acquiring=deps.inhibitor.acquire('RadioCLI alarm playback');void acquiring.then(acquired=>{if(signalReceived||action)void acquired.release().catch(()=>undefined);}).catch(()=>{});const acquired=await Promise.race([acquiring.then(value=>({value})),earlySignal.then(()=>({signal:true as const}))]);if('signal'in acquired){outcome=finish(backendEndedAt?'failed':'dismissed',backendEndedAt?backendMessage:'Alarm interrupted while sleep protection was starting.');return{status:outcome.status,message:outcome.message};}lease=acquired.value;deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'power',healthy:true,active:true,message:'Sleep inhibition active while playing.'});void lease.unexpectedExit?.then(error=>{try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'power',healthy:false,active:false,message:`Playback continues after sleep protection exited: ${error.message}`});}catch{}}).catch(()=>{});}catch(error){deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'power',healthy:false,active:false,message:`Playback continues without sleep protection: ${errorMessage(error)}`});}
    if(backendEndedAt)throw new Error(backendMessage??'Alarm stream ended while sleep protection was starting.');
    const startedAt=deps.now();listening=true;
    try{await deps.store.addRecent(resolvedStation);}catch(error){recordRunnerWarning(`Recent listening history could not be saved: ${errorMessage(error)}`);}
    try{await deps.store.startListeningSession(resolvedStation,startedAt);historyStarted=true;}catch(error){recordRunnerWarning(`Listening history could not be started: ${errorMessage(error)}`);}
    const activeStatus:ActiveAlarmStatus={alarmId,scheduledAt:scheduledAt.toISOString(),stationName:resolvedStation.name,station:resolvedStation,startedAt:startedAt.toISOString(),state:'playing'};
    session.update(activeStatus);
    void deps.openControls?.(activeStatus).then(result=>{if(result&&!result.opened&&result.terminal!=='existing-tui')recordRunnerWarning(`RadioCLI controls are unavailable or unverified: ${result.message}`);}).catch(error=>{recordRunnerWarning(`RadioCLI controls could not open automatically: ${errorMessage(error)}`);});
    onPlaybackSignal=()=>{action='signal';resolveAction('signal');};if(signalReceived)onPlaybackSignal();
    {
      const supportsFade=deps.player.getState().backend==='mpv';
      if(supportsFade&&alarm.playback.fadeSeconds>0){const zero=await deps.player.setVolume(0);if(zero.ok){const steps=Math.min(1800,Math.max(1,Math.ceil(alarm.playback.fadeSeconds/2)));for(let step=1;step<=steps&&!action;step+=1){await Promise.race([deps.wait(alarm.playback.fadeSeconds*1000/steps),actionPromise]);if(!action){const changed=await deps.player.setVolume(Math.round(alarm.playback.volume*step/steps));if(!changed.ok){await deps.player.setVolume(alarm.playback.volume);break;}}}}else await deps.player.setVolume(alarm.playback.volume);}
      else {const volume=await deps.player.setVolume(alarm.playback.volume);if(!volume.ok)deps.health?.record({alarmId,component:'runner',healthy:true,message:volume.message??'The selected backend does not support runtime volume; it started with the configured alarm volume.'});}
      if(!action){const elapsed=Math.max(0,deps.now().getTime()-startedAt.getTime());const timeout=deps.wait(Math.max(0,alarm.playback.stopAfterMinutes*60_000-elapsed)).then(()=>keepPlaying?new Promise<never>(()=>{}):'timeout' as const);action=await Promise.race([actionPromise,timeout]);}
    }
    outcome=finish(action==='backend-ended'?'failed':action==='dismissed'||action==='snoozed'||action==='signal'?'dismissed':'played',action==='backend-ended'?backendMessage:action==='snoozed'?'Snoozed.':action==='handoff'?'Handed off to interactive playback.':action==='signal'?'Interrupted.':undefined);
    return{status:outcome.status,message:outcome.message};
  }catch(error){outcome=finish(tuneAbort.signal.aborted&&action!=='backend-ended'?'dismissed':'failed',errorMessage(error));return{status:outcome.status,message:outcome.message};}
  finally{
    listening=false;
    unsubscribePlayer?.();
    tuneAbort.abort();
    unsubscribeSignals?.();
    try{await deps.player.stop();}catch{}
    await handoffOutput?.catch(()=>undefined);
    if(!preserveSystemVolume)try{await systemVolumeLease?.release();}catch(error){try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:false,active:false,message:`Previous system output volume could not be restored: ${errorMessage(error)}`});}catch{}}
    if(historyStarted){
      const endedAt=backendEndedAt??deps.now();
      try{await deps.store.checkpointActiveListeningSession(endedAt);}catch(error){recordRunnerWarning(`Listening history could not be checkpointed: ${errorMessage(error)}`);}
      try{await deps.store.finishActiveListeningSession(endedAt);}catch(error){recordRunnerWarning(`Listening history could not be finished: ${errorMessage(error)}`);}
    }
    try{await lease?.release();if(lease)deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'power',healthy:true,active:false,message:'Playback sleep inhibition released.'});}catch(error){try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'power',healthy:false,active:true,message:`Unable to verify inhibitor release: ${errorMessage(error)}`});}catch{}}
    try{await session?.close();}catch{}
    if(alarm&&outcome){try{await deps.store.recordAlarmOutcome(alarmId,outcome,{clearNextOverride:validTerminalOccurrence&&!preserveNextOverride});const latest=deps.store.getAlarm(alarmId);if(alarm.schedule.type==='once'&&latest?.schedule.type==='once'&&latest.schedule.at===alarm.schedule.at&&validTerminalOccurrence&&!preserveNextOverride)await deps.store.toggleAlarm(alarmId,false);}catch(error){recordRunnerWarning(`Alarm outcome or completion state could not be saved: ${errorMessage(error)}`);}}
    alarm=deps.store.getAlarm(alarmId);if(alarm)try{if(deps.scheduler.syncClaimed)await deps.scheduler.syncClaimed(alarm,scheduledAt);else await deps.scheduler.sync(alarm);}catch{}
    try{releaseLock(completeLock);}catch(error){try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'runner',healthy:false,active:false,message:`Occurrence lock cleanup failed: ${errorMessage(error)}`});}catch{}}
    if(completeLock)try{await deps.scheduler.completeOccurrence?.(alarmId,scheduledAt);}catch(error){try{deps.health?.record({alarmId,occurrenceAt:scheduledAt.toISOString(),component:'scheduler',healthy:false,message:`Completed launch job cleanup failed: ${errorMessage(error)}`});}catch{}}
  }
}

export function acquireOccurrenceLock(alarmId:string,scheduledAt:string,root=defaultAlarmRuntimeDirectory()):((completed?:boolean)=>void)|null{
  const occurrence = Buffer.from(scheduledAt).toString('base64url');
  // Keep existing claims for application-generated UUIDs. Other accepted IDs
  // need a bounded, case/normalization-safe identity on every filesystem. The
  // dot prefix cannot be produced by the old lossy sanitizer.
  const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(alarmId)
    ? alarmId : `.id-${createHash('sha256').update(JSON.stringify(alarmId)).digest('hex')}`;
  const path = join(root, 'locks', `${id}-${occurrence}`);
  const legacyPath = join(root, 'locks', `${alarmId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}-${occurrence}`);
  mkdirSync(dirname(path),{recursive:true,mode:0o700});pruneCompletedOccurrenceLocks(root);
  if (path !== legacyPath && hasLegacyOccurrenceClaim(legacyPath, alarmId)) return null;
  try{mkdirSync(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;try{if(existsSync(join(path,'completed')))return null;const pid=Number(readFileSync(join(path,'running'),'utf8'));if(Number.isInteger(pid)&&processAlive(pid))return null;rmSync(path,{recursive:true,force:true});mkdirSync(path,{mode:0o700});}catch{return null;}}
  try {
    writeFileSync(join(path,'running'),String(process.pid),{mode:0o600});
    writeFileSync(join(path,'alarm-id'),JSON.stringify(alarmId),{mode:0o600});
  } catch (error) { try { rmSync(path, {recursive: true, force: true}); } catch {} throw error; }
  return(completed=true)=>{if(!completed){rmSync(path,{recursive:true,force:true});return;}rmSync(join(path,'running'),{force:true});writeFileSync(join(path,'completed'),new Date().toISOString(),{mode:0o600});};
}
function hasLegacyOccurrenceClaim(path: string, alarmId: string): boolean {
  if (!existsSync(path)) return false;
  try {
    try { if (JSON.parse(readFileSync(join(path, 'alarm-id'), 'utf8')) !== alarmId) return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (existsSync(join(path, 'completed'))) return true;
    const pid = Number(readFileSync(join(path, 'running'), 'utf8'));
    return !Number.isInteger(pid) || pid < 1 || processAlive(pid);
  } catch { return existsSync(path); /* Unknown legacy ownership fails closed. */ }
}
export function pruneCompletedOccurrenceLocks(root=defaultAlarmRuntimeDirectory(),olderThanMs=30*24*60*60_000,now=Date.now()){const directory=join(root,'locks');if(!existsSync(directory))return 0;let removed=0;for(const name of readdirSync(directory)){const completed=join(directory,name,'completed');try{if(existsSync(completed)&&now-statSync(completed).mtimeMs>olderThanMs){rmSync(join(directory,name),{recursive:true,force:true});removed+=1;}}catch{}}return removed;}
export function defaultAlarmRuntimeDirectory():string{return platformPaths().runtime;}
export const defaultRunnerUtilities={acquireLock:acquireOccurrenceLock,createSession:startActiveAlarmSession,wait:(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds)),subscribeSignals:(handler:()=>void)=>{process.once('SIGTERM',handler);process.once('SIGHUP',handler);process.once('SIGINT',handler);return()=>{process.off('SIGTERM',handler);process.off('SIGHUP',handler);process.off('SIGINT',handler);};}};
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error);}
function processAlive(pid:number){try{process.kill(pid,0);return true;}catch(error){return(error as NodeJS.ErrnoException).code!=='ESRCH';}}
function nextExpectedOccurrence(alarm:Alarm,scheduledAt:Date){if(alarm.nextOverride)return new Date(alarm.nextOverride.at);if(alarm.schedule.type==='once')return new Date(alarm.schedule.at);return nextOccurrenceForAlarmAt(alarm,new Date(scheduledAt.getTime()-1500));}
function nextOccurrenceForAlarmAt(alarm:Alarm,now:Date){return nextOccurrenceForAlarm(alarm,now);}
