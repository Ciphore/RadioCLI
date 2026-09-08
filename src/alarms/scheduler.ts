import {createHash} from 'node:crypto';
import {existsSync, mkdirSync,readdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import type {Alarm} from '../types.js';
import {nextOccurrenceForAlarm} from './schedule.js';
import {AlarmRuntimeHealthStore} from './runtime-health.js';
import {AlarmGuardService} from './guard.js';
import {AlarmPowerGuardStore} from './power-guard-store.js';
import {detectAlarmTerminal} from './terminal-launcher.js';
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';
import {resolveCommandDetails} from '../player/command.js';
import {launchEnvironment, nodeLaunchCommand} from '../platform/launch-command.js';
import {powershellCommand} from '../platform/shell.js';

export type SchedulerCapabilities = {
  name?: string;
  supported: boolean;
  exactWake: boolean;
  catchUpAfterWake: boolean;
  message: string;
};
type CommandResult = {code: number; stdout: string; stderr: string};
type SchedulerStatus = {installed: boolean; healthy: boolean; message: string};
export type SchedulerAdapter = {
  capabilities(): SchedulerCapabilities;
  probeCapabilities?(): Promise<SchedulerCapabilities>;
  install(alarm: Alarm, occurrence: Date): Promise<void>;
  remove(alarmId: string): Promise<void>;
  status(alarmId: string): Promise<SchedulerStatus>;
  installFromRunner?(alarm:Alarm,occurrence:Date,currentOccurrence:Date):Promise<void>;
  removeFromRunner?(alarmId:string,currentOccurrence:Date):Promise<void>;
  completeOccurrence?(alarmId:string,occurrence:Date):Promise<void>;
};
export type SchedulerDeps = {
  platform?: NodeJS.Platform;
  home?: string;
  nodePath?: string;
  cliPath?: string;
  env?: NodeJS.ProcessEnv;
  writeFile?: (path: string, contents: string) => void;
  removeFile?: (path: string) => void;
  run?: (command: string, args: string[]) => Promise<CommandResult>;
  commandExists?: (command: string) => boolean;
};

export class SchedulerService {
  constructor(readonly adapter: SchedulerAdapter, private readonly now: () => Date = () => new Date(),readonly health=new AlarmRuntimeHealthStore(),private readonly guard?:{start(alarm:Alarm):Promise<unknown>;stop(alarmId?:string):Promise<boolean>;status?():Promise<GuardStatus>|GuardStatus}) {}

  async sync(alarm: Alarm): Promise<Date | null> {
    const occurrence = nextOccurrenceForAlarm(alarm, this.now());
    try {
      if (!occurrence) {
        const native = await settledOperation(() => this.adapter.remove(alarm.id));
        const guard = await settledOperation(() => this.reconcileGuard(alarm));
        if (native.error) this.health.record({alarmId:alarm.id,component:'scheduler',healthy:false,message:`Native job removal failed: ${native.error}`});
        else this.health.record({alarmId:alarm.id,component:'scheduler',healthy:true,message:'No enabled future occurrence; native job removed.'});
        const failures = [native.error, guard.error].filter((value): value is string => Boolean(value));
        if (failures.length) throw new Error(failures.join(' '));
        return null;
      }
      const capability = this.adapter.capabilities();
      if (!capability.supported) throw new Error(capability.message);
      await this.adapter.install(alarm, occurrence);
      this.health.record({alarmId:alarm.id,component:'scheduler',healthy:true,message:'Native job registered.',nextOccurrence:occurrence.toISOString()});
      await this.reconcileGuard(alarm);
      return occurrence;
    } catch(error) {if(!(error instanceof GuardReconcileError))this.health.record({alarmId:alarm.id,component:'scheduler',healthy:false,message:errorMessage(error),...(occurrence?{nextOccurrence:occurrence.toISOString()}:{})});throw error;}
  }

  async syncAll(alarms: readonly Alarm[]): Promise<Array<{id: string; occurrence: Date | null; error?: string}>> {
    return mapConcurrent(alarms,4,async alarm => {
      try { return {id: alarm.id, occurrence: await this.sync(alarm)}; }
      catch (error) { return {id: alarm.id, occurrence: null, error: errorMessage(error)}; }
    });
  }

  doctor(): SchedulerCapabilities { return this.adapter.capabilities(); }
  async syncClaimed(alarm:Alarm,currentOccurrence:Date):Promise<Date|null>{const occurrence=nextOccurrenceForAlarm(alarm,this.now());try{if(!occurrence){if(this.adapter.removeFromRunner)await this.adapter.removeFromRunner(alarm.id,currentOccurrence);else await this.adapter.remove(alarm.id);await this.ensureGuardAbsent(alarm.id);this.health.record({alarmId:alarm.id,component:'scheduler',healthy:true,message:'Claimed occurrence has no enabled future native job.'});return null;}const capability=this.adapter.capabilities();if(!capability.supported)throw new Error(capability.message);if(this.adapter.installFromRunner)await this.adapter.installFromRunner(alarm,occurrence,currentOccurrence);else await this.adapter.install(alarm,occurrence);this.health.record({alarmId:alarm.id,component:'scheduler',healthy:true,message:'Next native occurrence registered by active runner.',nextOccurrence:occurrence.toISOString()});await this.reconcileGuard(alarm);return occurrence;}catch(error){this.health.record({alarmId:alarm.id,component:'scheduler',healthy:false,message:errorMessage(error),...(occurrence?{nextOccurrence:occurrence.toISOString()}:{})});throw error;}}
  async completeOccurrence(alarmId:string,occurrence:Date):Promise<void>{await this.adapter.completeOccurrence?.(alarmId,occurrence);}
  async remove(alarmId:string):Promise<void>{await this.ensureGuardAbsent(alarmId);try{await this.adapter.remove(alarmId);}catch(error){this.health.record({alarmId,component:'scheduler',healthy:false,message:`Native job removal failed; the alarm definition was retained: ${errorMessage(error)}`});throw error;}this.health.remove(alarmId);}
  async statusAll(alarms:readonly Alarm[]){return mapConcurrent(alarms,4,async alarm=>{const occurrence=nextOccurrenceForAlarm(alarm,this.now());return{alarmId:alarm.id,nextOccurrence:occurrence?.toISOString()??null,native:occurrence?await this.adapter.status(alarm.id):{installed:false,healthy:true,message:'No enabled future occurrence; no native job is expected.'},health:this.health.get(alarm.id)};});}
  async runtimeStatus(alarms:readonly Alarm[]=[]){const [capabilities,status]=await Promise.all([this.adapter.probeCapabilities?.()??this.doctor(),this.statusAll(alarms)]);return{capabilities,entries:this.health.list(),alarms:status};}
  private async reconcileGuard(alarm:Alarm){if(!this.guard)return;try{const requested=alarm.enabled&&alarm.reliability.keepAwakeUntilAlarm;if(requested)await this.guard.start(alarm);else await this.ensureGuardAbsent(alarm.id);this.health.record({alarmId:alarm.id,component:'power',healthy:true,active:requested,message:requested?'Alarm Guard reconciled.':'Alarm Guard verified absent.'});}catch(error){const message=`Alarm Guard reconciliation failed: ${errorMessage(error)}`;this.health.record({alarmId:alarm.id,component:'power',healthy:false,active:true,message});throw new GuardReconcileError(message);}}
  private async ensureGuardAbsent(alarmId:string){if(!this.guard)return;const stopped=await this.guard.stop(alarmId);if(stopped)return;const status=await this.guard.status?.();if(status&&!status.guards.some(item=>item.alarmId===alarmId)&&!status.unresolvedGuards?.some(item=>!item.alarmId||item.alarmId===alarmId))return;const message='Alarm Guard teardown could not be verified; the alarm definition was retained for repair.';this.health.record({alarmId,component:'power',healthy:false,active:true,message});throw new GuardReconcileError(message);}
}
type GuardStatus={guards:Array<{alarmId:string}>;unresolvedGuards?:Array<{alarmId?:string}>};
class GuardReconcileError extends Error{}
async function settledOperation(work:()=>Promise<unknown>):Promise<{error?:string}>{try{await work();return{};}catch(error){return{error:errorMessage(error)};}}

export function createSchedulerService(deps: SchedulerDeps = {}): SchedulerService {
  return new SchedulerService(createSchedulerAdapter(deps),()=>new Date(),new AlarmRuntimeHealthStore(),new AlarmGuardService(new AlarmPowerGuardStore()));
}

export function createSchedulerAdapter(deps: SchedulerDeps = {}): SchedulerAdapter {
  const platform = deps.platform ?? process.platform;
  const home = deps.home ?? homedir();
  const nodePath = deps.nodePath ?? process.execPath;
  const cliPath = deps.cliPath ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
  const env = deps.env ?? process.env;
  const host = identifyPlatform({platform, env});
  const policy = nativeAdapters(host);
  const write = deps.writeFile ?? ((path, contents) => { mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, contents, {encoding: 'utf8', mode: 0o600}); });
  const removeFile = deps.removeFile ?? (path => rmSync(path, {force: true}));
  const resolve = (command:string) => resolveCommandDetails(command,{platform,env,home}).path;
  const run = deps.run ?? ((command,args) => runCommand(resolve(command)??command,args));
  const commandExists = deps.commandExists ?? (command => resolve(command)!==null);
  const common = {home, nodePath, cliPath, env, terminal: detectAlarmTerminal(platform, env), write, removeFile, run};
  if (policy.scheduler === 'launchd') return launchdAdapter(common);
  if (policy.scheduler === 'task-scheduler') return windowsAdapter(common);
  if (policy.scheduler === 'systemd') {
    if (commandExists('systemctl')) return systemdAdapter(common);
    return unavailableAdapter('systemctl is unavailable; systemd job registration and removal cannot be verified. Repair artifacts were retained.');
  }
  return unsupportedAdapter(`Alarm scheduling is not supported on ${host.id==='unknown'?host.platform:host.id}.`);
}

type Common = {home: string; nodePath: string; cliPath: string; env: NodeJS.ProcessEnv; terminal:string; write: (p:string,c:string)=>void; removeFile:(p:string)=>void; run:(c:string,a:string[])=>Promise<CommandResult>};
function runtimeEnvironment(common:Common):Record<string,string>{
  return launchEnvironment(common.env, {includeDesktop: true, terminal: common.terminal});
}
const jobName = (id: string) => `io.radiocli.alarm.${createHash('sha256').update(id).digest('hex').slice(0, 20)}`;
const invocationArgs = (common: Common, id: string, occurrence: Date,internalCommand='internal-run') => [common.cliPath, 'alarm', internalCommand, id, occurrence.toISOString()];
export function shouldRunLaunchdOccurrence(scheduledAt:string,now:Date){if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt))throw new Error('Launchd occurrence gate requires an absolute instant.');const scheduled=new Date(scheduledAt);if(!Number.isFinite(scheduled.getTime())||!Number.isFinite(now.getTime()))throw new Error('Invalid launchd occurrence gate time.');return now.getTime()>=scheduled.getTime();}

function launchdAdapter(common: Common): SchedulerAdapter {
  const directory=join(common.home,'Library','LaunchAgents');
  const pathFor = (id:string) => join(directory, `${jobName(id)}.plist`);
  const occurrenceLabel=(id:string,occurrence:Date)=>`${jobName(id)}.${createHash('sha256').update(occurrence.toISOString()).digest('hex').slice(0,12)}`;
  const occurrencePath=(id:string,occurrence:Date)=>join(directory,`${occurrenceLabel(id,occurrence)}.plist`);
  const pathsFor=(id:string)=>{const prefix=`${jobName(id)}.`;let extras:string[]=[];try{extras=readdirSync(directory).filter(name=>name.startsWith(prefix)&&name.endsWith('.plist')).map(name=>join(directory,name));}catch{}return[pathFor(id),...extras];};
  const installJob=async(alarm:Alarm,occurrence:Date,label:string,path:string,replace:boolean)=>{const local=localParts(occurrence);const entries=Object.entries(runtimeEnvironment(common)).map(([key,value])=>`<key>${xml(key)}</key><string>${xml(value)}</string>`).join('');const envArgs=`<key>EnvironmentVariables</key><dict>${entries}</dict>`;const args=[common.nodePath,...invocationArgs(common,alarm.id,occurrence,'internal-launchd')].map(value=>`<string>${xml(value)}</string>`).join('');common.write(path,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args}</array>${envArgs}<key>StartCalendarInterval</key><dict><key>Month</key><integer>${local.month}</integer><key>Day</key><integer>${local.day}</integer><key>Hour</key><integer>${local.hour}</integer><key>Minute</key><integer>${local.minute}</integer></dict><key>ProcessType</key><string>Interactive</string><key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string><!-- launchd repeats this calendar pattern annually; the idempotent runner gates, removes, or reschedules it. --></dict></plist>\n`);if(replace)await common.run('launchctl',['bootout',`gui/${process.getuid?.()??''}`,path]).catch(()=>undefined);ensureSuccess(await common.run('launchctl',['bootstrap',`gui/${process.getuid?.()??''}`,path]),'launchctl bootstrap');};
  const removeJob=async(path:string)=>{
    const label=path.split('/').at(-1)!.slice(0,-6);
    let failure:unknown;
    try{ensureSuccess(await common.run('launchctl',['bootout',`gui/${process.getuid?.()??''}`,path]),'launchctl bootout');}catch(error){failure=error;}
    if(failure){
      let status:CommandResult;
      try{status=await common.run('launchctl',['print',`gui/${process.getuid?.()??''}/${label}`]);}catch(error){throw new Error(`Unable to verify launchd job removal: ${errorMessage(error)}`);}
      if(status.code===0)throw new Error(`launchd job is still loaded: ${errorMessage(failure)}`);
      if(!isLaunchdServiceNotFound(status,label))throw new Error(`Unable to verify launchd job absence: ${commandMessage(status)}`);
    }
    common.removeFile(path);
  };
  return {
    capabilities: () => ({name:'launchd', supported: true, exactWake: false, catchUpAfterWake: true, message: 'launchd runs after wake when possible; exact wake is unavailable. Resync after changing the host timezone.'}),
    async install(alarm,occurrence){await installJob(alarm,occurrence,jobName(alarm.id),pathFor(alarm.id),true);},
    async installFromRunner(alarm,occurrence){const label=occurrenceLabel(alarm.id,occurrence);const existing=await common.run('launchctl',['print',`gui/${process.getuid?.()??''}/${label}`]);if(existing.code===0)return;await installJob(alarm,occurrence,label,occurrencePath(alarm.id,occurrence),false);},
    async removeFromRunner(){},
    async completeOccurrence(id,occurrence){const specific=occurrencePath(id,occurrence);await removeJob(existsSync(specific)?specific:pathFor(id));},
    async remove(id){for(const path of pathsFor(id))await removeJob(path);},
    async status(id){const paths=pathsFor(id).filter(existsSync);const executable=existsSync(common.nodePath)&&existsSync(common.cliPath);if(!paths.length)return{installed:false,healthy:false,message:'LaunchAgent artifact missing'};const results=await Promise.all(paths.map(path=>common.run('launchctl',['print',`gui/${process.getuid?.()??''}/${path.split('/').at(-1)!.slice(0,-6)}`])));const registered=results.some(result=>result.code===0);return{installed:registered,healthy:registered&&executable,message:!registered?'launchd registration missing':!executable?'RadioCLI executable missing':'registered and executable'};}
  };
}

function systemdAdapter(common: Common): SchedulerAdapter {
  const base = join(common.home,'.config','systemd','user'); const names=(id:string)=>({service:`${jobName(id)}.service`,timer:`${jobName(id)}.timer`});
  const capabilities=():SchedulerCapabilities=>({name:'systemd',supported:true,exactWake:false,catchUpAfterWake:true,message:'systemd tooling detected; user-manager readiness is checked during registration and diagnostics. Persistent user timers can catch up after login/wake; WakeSystem is not claimed without system privileges.'});
  const probeCapabilities=async():Promise<SchedulerCapabilities>=>{
    try{
      const result=await boundedProbe(common.run('systemctl',['--user','show','--property=Version','--value']));
      ensureSuccess(result,'systemd user manager probe');
      return{...capabilities(),message:'The systemd user manager is reachable. Persistent timers can catch up after login/wake; WakeSystem is not claimed without system privileges.'};
    }catch(error){return{...capabilities(),supported:false,catchUpAfterWake:false,message:`The systemd user manager is unavailable: ${errorMessage(error)}`};}
  };
  return {
    capabilities,
    probeCapabilities,
    async install(alarm, occurrence) { const readiness=await probeCapabilities();if(!readiness.supported)throw new Error(readiness.message);const n=names(alarm.id); const env=Object.entries(runtimeEnvironment(common)).map(([key,value])=>`Environment=${systemdQuote(`${key}=${value}`)}\n`).join(''); const cmd=systemdExecCommand([common.nodePath,...invocationArgs(common,alarm.id,occurrence)]); common.write(join(base,n.service),`[Unit]\nDescription=RadioCLI alarm ${unitText(alarm.label)}\n[Service]\nType=exec\n${env}ExecStart=${cmd}\n`); common.write(join(base,n.timer),`[Unit]\nDescription=RadioCLI scheduled radio ${unitText(alarm.label)}\n[Timer]\nOnCalendar=${systemdCalendar(occurrence)}\nPersistent=true\nAccuracySec=1s\nUnit=${n.service}\n[Install]\nWantedBy=timers.target\n`); ensureSuccess(await common.run('systemctl',['--user','daemon-reload']),'systemctl daemon-reload'); ensureSuccess(await common.run('systemctl',['--user','enable','--now',n.timer]),'systemctl enable'); },
    async remove(id){
      const n=names(id);
      await removeWithVerification(()=>common.run('systemctl',['--user','disable','--now',n.timer]),()=>common.run('systemctl',['--user','show',n.timer,'--property=LoadState','--property=ActiveState']),result=>/^LoadState=not-found\r?$/m.test(result.stdout)&&/^ActiveState=inactive\r?$/m.test(result.stdout),'systemd timer');
      common.removeFile(join(base,n.timer));common.removeFile(join(base,n.service));
      ensureSuccess(await common.run('systemctl',['--user','daemon-reload']),'systemctl daemon-reload after removal');
    },
    async status(id){const readiness=await probeCapabilities();if(!readiness.supported)return{installed:false,healthy:false,message:readiness.message};const n=names(id);const [enabled,active]=await Promise.all([common.run('systemctl',['--user','is-enabled',n.timer]),common.run('systemctl',['--user','is-active',n.timer])]);const artifact=existsSync(join(base,n.timer))&&existsSync(join(base,n.service));const executable=existsSync(common.nodePath)&&existsSync(common.cliPath);return{installed:enabled.code===0&&artifact,healthy:enabled.code===0&&active.code===0&&artifact&&executable,message:enabled.code!==0?'user timer not enabled':active.code!==0?'user timer is not active':!artifact?'systemd unit artifact missing':!executable?'RadioCLI executable missing':'enabled, active, and executable'};}
  };
}

function windowsAdapter(common: Common): SchedulerAdapter {
  const xmlPath=(id:string)=>join(common.env.LOCALAPPDATA??join(common.home,'AppData','Local'),'RadioCLI','scheduler',`${jobName(id)}.xml`);
  return {
    capabilities:()=>({name:'Task Scheduler',supported:true,exactWake:false,catchUpAfterWake:true,message:'Task Scheduler can request wake when hardware and policy permit, but exact wake cannot be guaranteed. Resync after changing the host timezone; a logged-in audio session is required. Alarm playback has no scheduler execution-time cutoff.'}),
    async install(alarm, occurrence) {
      const name = `\\RadioCLI\\${jobName(alarm.id)}`;
      const direct = nodeLaunchCommand(common.nodePath, invocationArgs(common, alarm.id, occurrence), runtimeEnvironment(common));
      // Task Scheduler expands %NAME% in Path and Arguments itself. Only its
      // standard PowerShell path and fixed flags/encoded data cross that boundary.
      const command = '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const args = powershellCommand(direct).join(' ');
      const body = `<?xml version="1.0" encoding="UTF-8"?><Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>${xml(alarm.label)}</Description></RegistrationInfo><Triggers><TimeTrigger><StartBoundary>${windowsLocalBoundary(occurrence)}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers><Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><StartWhenAvailable>true</StartWhenAvailable><WakeToRun>${alarm.reliability.wakeIfSupported}</WakeToRun><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy></Settings><Actions Context="Author"><Exec><Command>${xml(command)}</Command><Arguments>${xml(args)}</Arguments></Exec></Actions></Task>`;
      const path = xmlPath(alarm.id);
      common.write(path, body);
      ensureSuccess(await common.run('schtasks.exe', ['/Create', '/TN', name, '/XML', path, '/F']), 'schtasks create');
    },
    async remove(id){const name=`\\RadioCLI\\${jobName(id)}`;await removeWithVerification(()=>common.run('schtasks.exe',['/Delete','/TN',name,'/F']),()=>common.run('schtasks.exe',['/Query','/TN',name]),result=>result.code===1&&/^ERROR: The system cannot find the (?:file|path) specified\.$/.test(`${result.stderr}\n${result.stdout}`.trim()),'Task Scheduler job');common.removeFile(xmlPath(id));},
    async status(id){const result=await common.run('schtasks.exe',['/Query','/TN',`\\RadioCLI\\${jobName(id)}`]);const artifact=existsSync(xmlPath(id));const executable=existsSync(common.nodePath)&&existsSync(common.cliPath);return{installed:result.code===0&&artifact,healthy:result.code===0&&artifact&&executable,message:result.code!==0?'task not registered':!artifact?'task XML artifact missing':!executable?'RadioCLI executable missing':'registered and executable'};}
  };
}

function unsupportedAdapter(message:string):SchedulerAdapter{return{capabilities:()=>({supported:false,exactWake:false,catchUpAfterWake:false,message}),install:async()=>{throw new Error(message);},remove:async()=>{},status:async()=>({installed:false,healthy:false,message})};}
function unavailableAdapter(message: string): SchedulerAdapter {
  return {...unsupportedAdapter(message), remove: async () => {throw new Error(message);}};
}
function runCommand(command:string,args:string[]):Promise<CommandResult>{return new Promise(resolve=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:10_000});let stdout='';let stderr='';child.stdout.on('data',v=>stdout+=String(v));child.stderr.on('data',v=>stderr+=String(v));child.on('error',e=>resolve({code:127,stdout,stderr:e.message}));child.on('close',code=>resolve({code:code??1,stdout,stderr}));});}
async function boundedProbe(probe:Promise<CommandResult>):Promise<CommandResult>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([probe,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('User-manager probe timed out.')),3_000);})]);}finally{if(timer)clearTimeout(timer);}}
async function removeWithVerification(remove:()=>Promise<CommandResult>,query:()=>Promise<CommandResult>,isAbsent:(result:CommandResult)=>boolean,label:string):Promise<void>{
  let failure:unknown;
  try{ensureSuccess(await remove(),`${label} removal`);}catch(error){failure=error;}
  if(!failure)return;
  let result:CommandResult;
  try{result=await query();}catch(error){throw new Error(`Unable to verify ${label} removal: ${errorMessage(error)}`);}
  if(isAbsent(result))return;
  throw new Error(`Unable to verify ${label} absence; repair artifacts were retained. ${errorMessage(failure)} ${commandMessage(result)}`);
}
function commandMessage(result:CommandResult){return(result.stderr||result.stdout||`exit ${result.code}`).trim();}
function ensureSuccess(result:CommandResult,label:string){if(result.code!==0)throw new Error(`${label} failed: ${(result.stderr||result.stdout||`exit ${result.code}`).trim()}`);}
function xml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function systemdQuote(value:string){if(/[\r\n\0]/.test(value))throw new Error('Scheduler arguments cannot contain control characters.');return `"${value.replaceAll('%','%%').replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;}
function systemdExecCommand(values: string[]): string {
  // ':' disables $VAR/${VAR} expansion for ExecStart. Environment= has
  // different syntax: its dollar signs are already literal and must stay so.
  return `:${values.map(systemdQuote).join(' ')}`;
}
function localParts(date:Date){return{year:date.getFullYear(),month:date.getMonth()+1,day:date.getDate(),hour:date.getHours(),minute:date.getMinutes(),second:date.getSeconds()};}
function systemdCalendar(date:Date){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')} ${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}:${String(date.getUTCSeconds()).padStart(2,'0')} UTC`;}
function windowsLocalBoundary(date:Date){const p=localParts(date);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}T${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}:${String(p.second).padStart(2,'0')}`;}
function unitText(value:string){return value.replace(/[\r\n\0]/g,' ').replaceAll('%','%%').slice(0,200);}
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error);}
function isLaunchdServiceNotFound(result:CommandResult,label:string){const output=`${result.stderr}\n${result.stdout}`;const match=/could not find service "([^"]+)" in domain for\b/i.exec(output);return result.code!==0&&match?.[1]===label;}
async function mapConcurrent<T,R>(items:readonly T[],limit:number,work:(item:T)=>Promise<R>):Promise<R[]>{const results=new Array<R>(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const index=next;next+=1;if(index>=items.length)return;results[index]=await work(items[index]!);}}));return results;}
