import {spawn as nodeSpawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer,request} from 'node:http';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Alarm} from '../types.js';
import {AlarmPowerGuardStore} from './power-guard-store.js';
import type {PowerInhibitor} from './inhibitor.js';
import {nextOccurrenceForAlarm} from './schedule.js';
import {defaultAlarmRuntimeDirectory} from './runner.js';
import {isLoopbackHost, listenLoopback, type LoopbackHost} from '../platform/loopback.js';
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';

type GuardPid = {alarmId: string; occurrenceAt: string; pid: number; host?: LoopbackHost; port: number; token: string};
export type GuardSpawn = (command: string, args: string[], env: NodeJS.ProcessEnv) => {pid?: number; unref(): void};
type GuardVerifier=(guard:GuardPid)=>Promise<boolean>;
type GuardStopper=(guard:GuardPid)=>Promise<boolean>;

export class AlarmGuardService {
  constructor(
    private readonly store: AlarmPowerGuardStore,
    private readonly nodePath = process.execPath,
    private readonly cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.js'),
    private readonly spawn: GuardSpawn = spawnGuard,
    private readonly now: () => Date = () => new Date(),
    private readonly directory = join(defaultAlarmRuntimeDirectory(), 'alarm-guards'),
    private readonly verify:GuardVerifier=challengeGuard,
    private readonly requestStop:GuardStopper=requestGuardStop
  ) {}

  async start(alarm: Alarm): Promise<{occurrenceAt: string; pid: number}> {
    return this.withOwnership(alarm.id,()=>this.startOwned(alarm));
  }
  private async startOwned(alarm:Alarm):Promise<{occurrenceAt:string;pid:number}>{
    const occurrence = nextOccurrenceForAlarm(alarm, this.now());
    if (!occurrence) throw new Error('This alarm has no future enabled occurrence.');
    const occurrenceAt = occurrence.toISOString();
    const path = this.path(alarm.id, occurrenceAt);
    const existing = readPid(path);
    if (existing && await this.verify(existing)) return {occurrenceAt, pid: existing.pid};

    // A recurring alarm may have been edited/rescheduled while its old guard is
    // alive. Stop that exact process tree before replacing its occurrence state.
    await this.stopOwned(alarm.id);
    if (this.hasOwnershipRecords(alarm.id)) throw new Error('Previous Alarm Guard ownership is unresolved; retain the alarm for repair before starting another guard.');
    this.store.request(alarm.id, occurrenceAt);
    const token=randomBytes(32).toString('hex');
    const child = this.spawn(
      this.nodePath,
      [this.cliPath, 'alarm', 'internal-guard-run', alarm.id, occurrenceAt, path, token],
      process.env
    );
    if (!child.pid) {
      this.store.markFailed(alarm.id, 'Unable to start alarm guard.', occurrenceAt);
      throw new Error('Unable to start alarm guard.');
    }
    child.unref();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = this.store.get(alarm.id);
      const ownership=readPid(path);
      if (state?.occurrenceAt === occurrenceAt && state.status === 'active'&&ownership?.token===token&&await this.verify(ownership)) return {occurrenceAt, pid: child.pid};
      if (state?.occurrenceAt === occurrenceAt && state.status === 'failed') {
        await terminateGuardTree(child.pid);
        rmSync(path, {force: true});
        throw new Error(state.message ?? 'Alarm guard failed to start.');
      }
      if (!isAlive(child.pid)) break;
      await delay(50);
    }
    await terminateGuardTree(child.pid);
    this.store.markFailed(alarm.id, 'Alarm guard did not confirm sleep inhibition.', occurrenceAt);
    rmSync(path, {force: true});
    throw new Error('Alarm guard did not confirm sleep inhibition.');
  }

  async stop(alarmId?: string): Promise<boolean> {
    if(alarmId)return this.withOwnership(alarmId,()=>this.stopOwned(alarmId));
    const ids=[...new Set(this.pidFiles().map(readPid).filter((item):item is GuardPid=>Boolean(item)).map(item=>item.alarmId))];
    const results=await Promise.all(ids.map(id=>this.withOwnership(id,()=>this.stopOwned(id))));return results.every(Boolean)&&!this.hasOwnershipRecords();
  }
  private async stopOwned(alarmId?:string):Promise<boolean>{
    const targets = this.pidFiles()
      .map(path => ({path, owner: readPid(path)}))
      .filter((item): item is {path: string; owner: GuardPid} => Boolean(item.owner))
      .filter(item => !alarmId || item.owner.alarmId === alarmId);
    if (!targets.length) return false;
    for (const {path, owner: current} of targets) {
      if (!(await this.verify(current))) {
        if (!isAlive(current.pid)) rmSync(path, {force: true});
        markIfCurrent(this.store, current, 'Guard ownership challenge failed; the PID was not signaled.');
        continue;
      }
      if(!(await this.requestStop(current))){markIfCurrent(this.store,current,'Guard rejected its authenticated stop request; the PID was not signaled.');continue;}
      for(let attempt=0;attempt<20&&isAlive(current.pid);attempt+=1)await delay(50);
      if(isAlive(current.pid)&&await this.verify(current))await terminateGuardTree(current.pid);
      const alive = isAlive(current.pid);
      if (alive) {
        markIfCurrent(this.store, current, 'Unable to stop the guard helper; sleep inhibition may still be active.');
        continue;
      }
      rmSync(path, {force: true});
      const state = this.store.get(current.alarmId);
      if (state?.occurrenceAt === current.occurrenceAt && state.status !== 'released') {
        this.store.markReleased(current.alarmId, new Date(), current.occurrenceAt);
      }
    }
    return !this.hasOwnershipRecords(alarmId);
  }

  async status() {
    const guards=[] as Array<{active:true;alarmId:string;occurrenceAt:string;pid:number}>;
    const unresolvedGuards=[] as Array<{alarmId?:string;occurrenceAt?:string;pid?:number;message:string}>;
    for(const path of this.pidFiles()){
      const pid = readPid(path);
      if (!pid) {
        const alarmId=alarmIdFromPath(path);
        unresolvedGuards.push({...(alarmId?{alarmId}:{}),message:'Guard ownership metadata cannot be read; its record was retained for repair.'});
        continue;
      }
      if (!(await this.verify(pid))) {
        if (isAlive(pid.pid)) {
          const message='Guard ownership cannot be verified; its record was retained and the PID was not signaled.';
          unresolvedGuards.push({alarmId:pid.alarmId,occurrenceAt:pid.occurrenceAt,pid:pid.pid,message});
          markIfCurrent(this.store,pid,message);
        } else {
          rmSync(path, {force: true});
          markIfCurrent(this.store, pid, 'The guard process exited unexpectedly.');
        }
        continue;
      }
      guards.push({active:true,alarmId:pid.alarmId,occurrenceAt:pid.occurrenceAt,pid:pid.pid});
    }
    return {
      active: guards.length > 0,
      guards,
      unresolvedGuards,
      message: unresolvedGuards.length
        ? `${guards.length} alarm guards verified active; ${unresolvedGuards.length} ownership records require repair.`
        : guards.length ? `${guards.length} alarm guard${guards.length === 1 ? ' is' : 's are'} active.` : 'No alarm guard is active.'
    };
  }

  private path(alarmId: string, occurrenceAt: string): string {
    return join(this.directory, `${Buffer.from(`${alarmId}\0${occurrenceAt}`).toString('base64url')}.json`);
  }

  private pidFiles(): string[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).filter(name => name.endsWith('.json')).map(name => join(this.directory, name));
  }
  private hasOwnershipRecords(alarmId?:string):boolean {
    return this.pidFiles().some(path=>{
      const ownerId=readPid(path)?.alarmId??alarmIdFromPath(path);
      return !alarmId||!ownerId||ownerId===alarmId;
    });
  }
  private async withOwnership<T>(alarmId:string,work:()=>Promise<T>):Promise<T>{const lock=join(this.directory,`.lock-${Buffer.from(alarmId).toString('base64url')}`);mkdirSync(this.directory,{recursive:true,mode:0o700});const deadline=Date.now()+3000;while(true){try{mkdirSync(lock,{mode:0o700});writeFileSync(join(lock,'created'),String(Date.now()),{mode:0o600});break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;let stale=false;try{const created=Number(readFileSync(join(lock,'created'),'utf8'));stale=Number.isFinite(created)?Date.now()-created>10_000:Date.now()-statSync(lock).mtimeMs>10_000;}catch{try{stale=Date.now()-statSync(lock).mtimeMs>10_000;}catch{}}if(stale){rmSync(lock,{recursive:true,force:true});continue;}if(Date.now()>deadline)throw new Error('Alarm Guard ownership is busy.');await delay(20);}}try{return await work();}finally{rmSync(lock,{recursive:true,force:true});}}
}

export async function runAlarmGuard(
  alarmId: string,
  occurrenceAtText: string,
  inhibitor: PowerInhibitor,
  store = new AlarmPowerGuardStore(),
  now: () => Date = () => new Date(),
  wait: (milliseconds: number) => Promise<void> = delay,
  pidPath?: string
  ,ownershipToken?:string
): Promise<void> {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(occurrenceAtText)) throw new Error('Guard occurrence must be an absolute ISO-8601 instant.');
  const occurrence = new Date(occurrenceAtText);
  if (!Number.isFinite(occurrence.getTime())) throw new Error('Invalid guard occurrence.');
  if (occurrence.getTime() <= now().getTime()) throw new Error('The guard occurrence has already passed.');
  const occurrenceAt = occurrence.toISOString();
  let lease: Awaited<ReturnType<PowerInhibitor['acquire']>> | undefined;
  let released = false;let control:Awaited<ReturnType<typeof startGuardControl>>|undefined;
  let stopped = false;
  let resolveSignal: () => void = () => {};
  const signal = new Promise<void>(resolve => { resolveSignal = resolve; });
  const handler = () => { stopped = true; resolveSignal(); };
  process.once('SIGTERM', handler);
  process.once('SIGHUP', handler);
  process.once('SIGINT', handler);
  try {
    lease = await inhibitor.acquire('Keep awake until RadioCLI alarm');
    if(pidPath&&ownershipToken)control=await startGuardControl(pidPath,ownershipToken,alarmId,occurrenceAt,handler);
    if(!store.get(alarmId))store.request(alarmId,occurrenceAt);
    store.markActive(alarmId, now(), occurrenceAt);
    const deadline = occurrence.getTime() + 60_000;
    const inhibitorExit=lease.unexpectedExit?.then(error=>{throw error;});
    while (!stopped && now().getTime() < deadline) {
      await Promise.race([wait(Math.min(30_000,2_000_000_000, deadline - now().getTime())), signal,...(inhibitorExit?[inhibitorExit]:[])]);
    }
    await lease.release();
    released = true;
    store.markReleased(alarmId, now(), occurrenceAt);
  } catch (error) {
    const state = store.get(alarmId);
    const stillOwnsArtifact = !pidPath || !ownershipToken || ownsArtifact(pidPath, ownershipToken);
    if (!released && stillOwnsArtifact && state?.occurrenceAt === occurrenceAt && state.status !== 'released') {
      store.markFailed(alarmId, error instanceof Error ? error.message : String(error), occurrenceAt);
    }
    throw error;
  } finally {
    process.off('SIGTERM', handler);
    process.off('SIGHUP', handler);
    process.off('SIGINT', handler);
    if (!released) await lease?.release().catch(() => undefined);
    await control?.close();
    if (pidPath && (!ownershipToken || ownsArtifact(pidPath, ownershipToken))) rmSync(pidPath, {force: true});
  }
}

function markIfCurrent(store: AlarmPowerGuardStore, pid: GuardPid, message: string): void {
  const state = store.get(pid.alarmId);
  if (state?.occurrenceAt === pid.occurrenceAt && state.status !== 'released' && state.status !== 'failed') {
    store.markFailed(pid.alarmId, message, pid.occurrenceAt);
  }
}
function spawnGuard(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return nodeSpawn(command, args, {env, detached: true, stdio: 'ignore', windowsHide: true});
}
function readPid(path: string): GuardPid | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as GuardPid;
    if (!Number.isInteger(value.pid) || value.pid<1 || !Number.isInteger(value.port)||value.port<1||value.port>65535||typeof value.alarmId!=='string'||!value.alarmId || (value.host!==undefined&&!isLoopbackHost(value.host)) || !/^[a-f0-9]{64}$/.test(value.token)||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value.occurrenceAt) || !Number.isFinite(Date.parse(value.occurrenceAt))) throw new Error();
    return value;
  } catch {
    return undefined;
  }
}
function alarmIdFromPath(path:string):string|undefined {
  const name=basename(path,'.json');const decoded=Buffer.from(name,'base64url').toString();
  if(Buffer.from(decoded).toString('base64url')!==name)return undefined;
  const separator=decoded.indexOf('\0');
  return separator>0?decoded.slice(0,separator):undefined;
}
function writePrivate(path: string, value: GuardPid): void {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const temp=`${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeFileSync(temp, JSON.stringify(value), {mode: 0o600});
  renameSync(temp,path);
  if (nativeAdapters().posixPermissions) chmodSync(path, 0o600);
}
function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
function ownsArtifact(path: string, token: string): boolean {
  return readPid(path)?.token === token;
}
async function startGuardControl(path:string,token:string,alarmId:string,occurrenceAt:string,onStop:()=>void){
  const server=createServer((req,res)=>{if(req.headers.authorization!==`Bearer ${token}`){res.statusCode=401;res.end('{}');return;}if(req.method==='POST'&&req.url==='/stop'){onStop();res.end('{}');return;}if(req.method!=='GET'||req.url!=='/challenge'){res.statusCode=404;res.end('{}');return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({alarmId,occurrenceAt,pid:process.pid}));});
  const close=()=>new Promise<void>(resolve=>server.close(()=>resolve()));
  try {
    const {host,port}=await listenLoopback(server);
    writePrivate(path,{alarmId,occurrenceAt,pid:process.pid,host,port,token});
    return {close};
  } catch(error) { await close();throw error; }
}
function challengeGuard(guard:GuardPid):Promise<boolean>{return callGuard(guard,'GET','/challenge',true);}
function requestGuardStop(guard:GuardPid):Promise<boolean>{return callGuard(guard,'POST','/stop',false);}
function callGuard(guard:GuardPid,method:string,path:string,validateIdentity:boolean):Promise<boolean>{return new Promise(resolve=>{const req=request({host:guard.host??'127.0.0.1',port:guard.port,path,method,agent:false,headers:{authorization:`Bearer ${guard.token}`}},res=>{let body='';res.on('data',value=>body+=String(value));res.on('end',()=>{if(!validateIdentity){resolve(res.statusCode===200);return;}try{const reply=JSON.parse(body) as {alarmId?:string;occurrenceAt?:string;pid?:number};resolve(res.statusCode===200&&reply.alarmId===guard.alarmId&&reply.occurrenceAt===guard.occurrenceAt&&reply.pid===guard.pid);}catch{resolve(false);}});});req.once('error',()=>resolve(false));req.setTimeout(500,()=>req.destroy());req.end();});}
export type GuardProcessOps={platform:NodeJS.Platform;isAlive(pid:number):boolean;kill(pid:number,signal:NodeJS.Signals):void;taskkill(pid:number,force:boolean):Promise<void>;wait(milliseconds:number):Promise<void>};
export async function terminateGuardTree(pid: number,ops:GuardProcessOps={platform:process.platform,isAlive,kill:(target,signal)=>process.kill(target,signal),taskkill:taskkillTree,wait:delay}): Promise<void> {
  const windows=nativeAdapters(identifyPlatform({platform:ops.platform})).ipc==='named-pipe';
  // Kill the entire detached tree first on Windows so a dying parent cannot
  // orphan its PowerShell execution-state helper.
  if (windows) {
    await ops.taskkill(pid, false);
  } else {
    try { ops.kill(pid, 'SIGTERM'); } catch { return; }
  }
  for (let index = 0; index < 20 && ops.isAlive(pid); index += 1) await ops.wait(50);
  if (!ops.isAlive(pid)) return;
  if (windows) await ops.taskkill(pid, true);
  else {
    // The guard is a detached process-group leader; force-killing the negative
    // PID guarantees its inhibitor helper cannot survive an unresponsive parent.
    try { ops.kill(-pid, 'SIGKILL'); } catch { try { ops.kill(pid, 'SIGKILL'); } catch {} }
  }
}
function taskkillTree(pid: number, force: boolean): Promise<void> {
  return new Promise(resolve => {
    const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])];
    const child = nodeSpawn('taskkill.exe', args, {stdio: 'ignore', windowsHide: true});
    child.once('close', () => resolve());
    child.once('error', () => resolve());
  });
}
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
