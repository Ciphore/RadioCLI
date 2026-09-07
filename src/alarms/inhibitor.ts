import {spawn as nodeSpawn} from 'node:child_process';
import {resolveCommandDetails} from '../player/command.js';
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';

type InhibitorStatus = {supported: boolean; active: boolean; message: string};
export type InhibitorLease = {release(): Promise<void>;unexpectedExit?:Promise<Error>};
type Spawned = {pid?: number; kill(signal?: NodeJS.Signals): boolean | void; exited: Promise<unknown>};
export type PowerInhibitor = {
  status(): InhibitorStatus;
  acquire(reason: string): Promise<InhibitorLease>;
};
export type InhibitorDeps = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawn?: (command:string,args:string[])=>Spawned;
  commandExists?: (command:string)=>boolean;
};

// The script contains no interpolated data. It keeps one process-level Windows
// execution-state request alive until the parent terminates it.
const windowsInhibitorScript = (parentPid:number) => `$s='[DllImport("kernel32.dll")]public static extern uint SetThreadExecutionState(uint e);';Add-Type -MemberDefinition $s -Name P -Namespace R;[R.P]::SetThreadExecutionState(0x80000001)|Out-Null;try{while(Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue){Start-Sleep -Seconds 2}}finally{[R.P]::SetThreadExecutionState(0x80000000)|Out-Null}`;

export function createPowerInhibitor(deps: InhibitorDeps = {}): PowerInhibitor {
  const platform = deps.platform ?? process.platform;
  const env=deps.env??process.env;
  const host=identifyPlatform({platform,env});
  const adapter=nativeAdapters(host).inhibitor;
  const spawn = deps.spawn ?? ((command,args)=>spawnDetached(command,args,env));
  const spec = adapter === 'caffeinate'
    ? {command:'caffeinate',args:['-i','-w',String(process.pid)],message:'Prevents idle system sleep; the display may sleep.'}
    : adapter === 'logind'
      ? {command:'systemd-inhibit',args:['--what=sleep','--who=RadioCLI','--why=Scheduled radio','--mode=block','sh','-c','while kill -0 "$1" 2>/dev/null; do sleep 2; done','radiocli-inhibitor',String(process.pid)],message:'Uses a logind sleep inhibitor; explicit sleep and lid policy may override it.'}
      : adapter === 'windows'
        ? {command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-Command',windowsInhibitorScript(process.pid)],message:'Prevents idle system sleep; explicit sleep and lid policy may override it.'}
        : null;
  let active = false;
  const command=spec?(deps.commandExists?(deps.commandExists(spec.command)?spec.command:null):resolveCommandDetails(spec.command,{platform,env}).path):null;
  const supported = Boolean(command);
  const message=!spec?`Power inhibition is unsupported on ${host.id==='unknown'?platform:host.id}.`:!command?`${spec.command} is unavailable; sleep protection cannot be acquired.`:spec.message;
  return {
    status:()=>({supported,active,message}),
    async acquire(_reason){
      if (!spec || !command) throw new Error(message);
      const child=spawn(command,spec.args);const exitedEarly=await exitedWithin(child.exited,50);if(exitedEarly)throw new Error(`${spec.command} exited before sleep inhibition became active.`);active=true; let released=false;
      const unexpectedExit=child.exited.then(()=>{active=false;return released?new Promise<never>(()=>{}):new Error(`${spec.command} exited unexpectedly; sleep protection was lost.`);});
      return {unexpectedExit,async release(){if(released)return;released=true;active=false;child.kill('SIGTERM');if(await exitedWithin(child.exited,1000))return;child.kill('SIGKILL');if(!(await exitedWithin(child.exited,500)))throw new Error(`${spec.command} did not terminate; sleep protection state is unknown.`);}};
    }
  };
}

function spawnDetached(command:string,args:string[],env:NodeJS.ProcessEnv):Spawned {
  const child=nodeSpawn(command,args,{env,stdio:'ignore',windowsHide:true});
  return {pid:child.pid,kill:signal=>child.kill(signal),exited:new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);})};
}
async function exitedWithin(exited:Promise<unknown>,milliseconds:number){let timer:NodeJS.Timeout|undefined;try{return await Promise.race([exited.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}finally{if(timer)clearTimeout(timer);}}
