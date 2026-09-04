import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Alarm,AppSettings,Station} from '../types.js';
import {PlayerController} from '../player/player-controller.js';
import {detectPlaybackBackends} from '../player/backend-install.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {connectActiveAlarm,startActiveAlarmSession} from './active-session.js';
import {createPowerInhibitor,type PowerInhibitor} from './inhibitor.js';
import type {SchedulerService} from './scheduler.js';
import {createSystemVolumeController,type SystemVolumeController} from './system-volume.js';
import {verifyAlarmTerminalLaunch} from './terminal-launcher.js';

type AlarmVerificationState='pending'|'running'|'passed'|'warning'|'failed';
type AlarmVerificationStep={id:string;label:string;state:AlarmVerificationState;detail:string;critical:boolean};
export type AlarmVerificationReport={state:'running'|'passed'|'warning'|'failed';steps:AlarmVerificationStep[];alarmLabel?:string;startedAt:string;finishedAt?:string};
export type AlarmVerificationUpdate=(report:AlarmVerificationReport)=>void;

type PlayerLike={refreshDetectedBackends():void;play(station:Station,url:string):Promise<void>;stop():Promise<void>};
type VerificationDeps={
  terminalProbe?():Promise<string>;
  inhibitor?:PowerInhibitor;
  systemVolume?:SystemVolumeController;
  backends?:()=>string[];
  resolve?(station:Station):Promise<{url:string}>;
  player?(settings:AppSettings):PlayerLike;
  wait?(milliseconds:number):Promise<void>;
  controlProbe?():Promise<void>;
  now?:()=>Date;
  id?:()=>string;
};

const definitions:Array<Pick<AlarmVerificationStep,'id'|'label'|'critical'>>=[
  {id:'scheduler',label:'Native scheduler',critical:true},
  {id:'wake',label:'Wake and catch-up policy',critical:false},
  {id:'terminal',label:'Ringing terminal',critical:true},
  {id:'controls',label:'Dismiss and snooze controls',critical:true},
  {id:'playback',label:'Station and audio backend',critical:true},
  {id:'volume',label:'System output volume',critical:false},
  {id:'power',label:'Sleep protection',critical:false},
  {id:'cleanup',label:'Verification cleanup',critical:true}
];

export async function verifyAlarmSetup(scheduler:SchedulerService,alarm:Alarm|undefined,settings:AppSettings,onUpdate:AlarmVerificationUpdate=()=>{},deps:VerificationDeps={}):Promise<AlarmVerificationReport>{
  const now=deps.now??(()=>new Date());const startedAt=now().toISOString();
  let report:AlarmVerificationReport={state:'running',alarmLabel:alarm?.label,startedAt,steps:definitions.map(item=>({...item,state:'pending',detail:'Waiting…'}))};
  const publish=()=>{report={...report,steps:report.steps.map(step=>({...step}))};onUpdate(report);};
  const set=(id:string,state:AlarmVerificationState,detail:string)=>{const step=report.steps.find(item=>item.id===id);if(step){step.state=state;step.detail=detail;}publish();};
  publish();

  const target=alarm?.playback.volume??settings.volume;
  let temporary:Alarm|undefined;let schedulerInstalled=false;let powerLease:Awaited<ReturnType<PowerInhibitor['acquire']>>|undefined;let volumeLease:Awaited<ReturnType<SystemVolumeController['acquireMinimum']>>|undefined;
  try{
    set('scheduler','running','Installing a disposable native job…');
    try{
      const capability=scheduler.doctor();if(!capability.supported)throw new Error(capability.message);
      temporary=temporaryAlarm(alarm,now(),deps.id?.()??randomUUID());
      const occurrence=await scheduler.sync(temporary);if(!occurrence)throw new Error('The disposable alarm did not receive a future occurrence.');schedulerInstalled=true;
      const [status]=await scheduler.statusAll([temporary]);if(!status?.native.installed||!status.native.healthy)throw new Error(status?.native.message??'The native job could not be verified.');
      set('scheduler','passed',`Registered and queried a disposable ${platformSchedulerName()} job.`);
      if(alarm?.reliability.wakeIfSupported)set('wake',capability.exactWake?'passed':'warning',capability.exactWake?'This scheduler reports exact wake support.':`The OS accepted the job, but wake remains hardware and policy dependent. ${capability.message}`);
      else set('wake','passed',capability.catchUpAfterWake?'Wake was not requested; the native scheduler supports catch-up after the machine wakes.':'Wake was not requested for this alarm.');
    }catch(error){set('scheduler','failed',messageOf(error));set('wake','warning','Wake behavior could not be assessed because native scheduler verification failed.');}

    set('terminal','running','Opening the saved terminal and waiting for its authenticated response…');
    try{const terminal=await (deps.terminalProbe??(()=>verifyAlarmTerminalLaunch()))();set('terminal','passed',`Opened ${friendlyTerminal(terminal)} and received its private loopback response.`);}catch(error){set('terminal','failed',messageOf(error));}

    set('controls','running','Testing the same authenticated local channel used by dismiss and snooze…');
    try{await (deps.controlProbe??probeControlChannel)();set('controls','passed','Authenticated local ringing controls connected successfully.');}catch(error){set('controls','failed',messageOf(error));}

    const inhibitor=deps.inhibitor??createPowerInhibitor();set('power','running','Acquiring a real sleep-inhibition lease…');
    try{const capability=inhibitor.status();if(!capability.supported)throw new Error(capability.message);powerLease=await inhibitor.acquire('RadioCLI alarm setup verification');set('power','passed',capability.message);void powerLease.unexpectedExit?.then(error=>set('power','warning',`Sleep protection exited during the rehearsal: ${error.message}`)).catch(()=>{});}catch(error){set('power','warning',`Playback can continue, but sleep protection was not verified: ${messageOf(error)}`);}

    const volume=deps.systemVolume??createSystemVolumeController();set('volume','running',`Raising and unmuting local output to at least ${target}%…`);
    try{volumeLease=await volume.acquireMinimum(target);set('volume','passed',`${volumeLease.message} The previous setting will be restored after the sample.`);}catch(error){set('volume','warning',`Player volume will still be applied, but OS output control was not verified: ${messageOf(error)}`);}

    set('playback','running',alarm?`Playing a short sample of ${alarm.station.name}…`:'Waiting for a configured alarm station…');
    if(!alarm)set('playback','failed','Create at least one alarm so verification can test its real station, backend, and configured volume.');
    else try{
      const backends=(deps.backends??(()=>detectPlaybackBackends()))();if(!backends.length)throw new Error('No local playback backend is installed. Install mpv, ffplay, or VLC.');
      const runtimeSettings={...settings,volume:target,preferredBackend:'auto' as const,preferredAirPlayDevice:undefined,tuneTimeoutSeconds:Math.min(5,settings.tuneTimeoutSeconds)};
      const player=(deps.player??(value=>new PlayerController(()=>value)))(runtimeSettings);player.refreshDetectedBackends();
      const resolver=deps.resolve??(station=>new ProviderManager().resolve(station));
      try{const stream=await bounded(resolver(alarm.station),8_000,'Station resolution timed out.');await bounded(player.play(alarm.station,stream.url),8_000,'Audio backend did not become ready.');await (deps.wait??wait)(3_000);set('playback','passed',`Played a 3-second sample using an available local backend at the configured ${target}% alarm volume.`);}finally{try{await bounded(player.stop(),2_000,'Audio preview cleanup timed out.');}catch(error){set('playback','failed',`The sample started, but audio cleanup failed: ${messageOf(error)}`);}}
    }catch(error){set('playback','failed',messageOf(error));}
  }finally{
    try{await volumeLease?.release();}catch(error){set('volume','warning',`The sample ran, but the previous system volume could not be restored: ${messageOf(error)}`);}
    try{await powerLease?.release();}catch(error){set('power','warning',`Sleep protection was acquired, but release could not be verified: ${messageOf(error)}`);}
    set('cleanup','running','Removing disposable native scheduler artifacts…');
    if(temporary)try{await scheduler.remove(temporary.id);schedulerInstalled=false;set('cleanup','passed','Disposable scheduler job and local verification artifacts were removed.');}catch(error){set('cleanup','failed',`Manual repair is required because disposable job cleanup failed: ${messageOf(error)}`);}
    else set('cleanup','passed','No disposable native job was created.');
    if(schedulerInstalled)set('cleanup','failed','The disposable native job may still be installed; run Alarm Repair before relying on alarms.');
  }
  const failed=report.steps.some(step=>step.state==='failed'&&step.critical);const warning=report.steps.some(step=>step.state==='warning'||step.state==='failed');
  report={...report,state:failed?'failed':warning?'warning':'passed',finishedAt:now().toISOString()};publish();return report;
}

function temporaryAlarm(source:Alarm|undefined,now:Date,id:string):Alarm{const at=new Date(Math.ceil((now.getTime()+10*60_000)/60_000)*60_000);return{id:`setup-verification-${id}`,label:'RadioCLI setup verification',enabled:true,station:source?.station??{id:'verification',provider:'playlist',name:'RadioCLI verification',tags:[],streamUrl:'https://127.0.0.1/'},schedule:{type:'once',at:at.toISOString()},playback:{volume:source?.playback.volume??40,fadeSeconds:0,stopAfterMinutes:1},reliability:{missedRunGraceMinutes:1,wakeIfSupported:false},createdAt:now.toISOString(),updatedAt:now.toISOString()};}
async function probeControlChannel():Promise<void>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-verify-'));const file=join(root,'probe.json');const server=await startActiveAlarmSession({alarmId:'setup-verification',scheduledAt:new Date().toISOString(),stationName:'RadioCLI verification',startedAt:new Date().toISOString()},{filePath:file,onDismiss:()=>{},onSnooze:()=>{},onKeepPlaying:()=>{}});try{const client=await connectActiveAlarm(file);if(!client)throw new Error('The ringing control channel was not discoverable.');const status=await client.status();if(status.alarmId!=='setup-verification')throw new Error('The ringing control channel returned the wrong alarm identity.');}finally{await server.close();rmSync(root,{recursive:true,force:true});}}
function platformSchedulerName(){return process.platform==='darwin'?'launchd':process.platform==='win32'?'Task Scheduler':'systemd';}
function friendlyTerminal(value:string){return value.replace(/^darwin:/,'').replace(/^win32:/,'').replace(/^linux:/,'');}
function messageOf(error:unknown){return error instanceof Error?error.message:String(error);}
function wait(milliseconds:number){return new Promise<void>(resolve=>setTimeout(resolve,milliseconds));}
async function bounded<T>(promise:Promise<T>,milliseconds:number,message:string):Promise<T>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]);}finally{if(timer)clearTimeout(timer);}}
