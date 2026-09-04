import {spawn as nodeSpawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {delimiter, join} from 'node:path';

type InhibitorStatus = {supported: boolean; active: boolean; message: string};
export type InhibitorLease = {release(): Promise<void>;unexpectedExit?:Promise<Error>};
type Spawned = {pid?: number; kill(signal?: NodeJS.Signals): boolean | void; exited: Promise<unknown>};
export type PowerInhibitor = {
  status(): InhibitorStatus;
  acquire(reason: string): Promise<InhibitorLease>;
};
export type InhibitorDeps = {
  platform?: NodeJS.Platform;
  spawn?: (command:string,args:string[])=>Spawned;
  commandExists?: (command:string)=>boolean;
};

// The script contains no interpolated data. It keeps one process-level Windows
// execution-state request alive until the parent terminates it.
const windowsInhibitorScript = (parentPid:number) => `$s='[DllImport("kernel32.dll")]public static extern uint SetThreadExecutionState(uint e);';Add-Type -MemberDefinition $s -Name P -Namespace R;[R.P]::SetThreadExecutionState(0x80000001)|Out-Null;try{while(Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue){Start-Sleep -Seconds 2}}finally{[R.P]::SetThreadExecutionState(0x80000000)|Out-Null}`;

export function createPowerInhibitor(deps: InhibitorDeps = {}): PowerInhibitor {
  const platform = deps.platform ?? process.platform;
  const spawn = deps.spawn ?? spawnDetached;
  const exists = deps.commandExists ?? executableExists;
  const spec = platform === 'darwin'
    ? {command:'caffeinate',args:['-i','-w',String(process.pid)],message:'Prevents idle system sleep; the display may sleep.'}
    : platform === 'linux'
      ? {command:'systemd-inhibit',args:['--what=sleep','--who=RadioCLI','--why=Scheduled radio','--mode=block','sh','-c','while kill -0 "$1" 2>/dev/null; do sleep 2; done','radiocli-inhibitor',String(process.pid)],message:'Uses a logind sleep inhibitor; explicit sleep and lid policy may override it.'}
      : platform === 'win32'
        ? {command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-Command',windowsInhibitorScript(process.pid)],message:'Prevents idle system sleep; explicit sleep and lid policy may override it.'}
        : null;
  let active = false;
  const supported = Boolean(spec && exists(spec.command));
  return {
    status:()=>({supported,active,message:spec?.message ?? `Power inhibition is unsupported on ${platform}.`}),
    async acquire(_reason){
      if (!spec || !supported) throw new Error(spec?.message ?? `Power inhibition is unsupported on ${platform}.`);
      const child=spawn(spec.command,spec.args);const exitedEarly=await Promise.race([child.exited.then(()=>true),new Promise<false>(resolve=>setTimeout(()=>resolve(false),50))]);if(exitedEarly)throw new Error(`${spec.command} exited before sleep inhibition became active.`);active=true; let released=false;
      const unexpectedExit=child.exited.then(()=>released?new Promise<never>(()=>{}):new Error(`${spec.command} exited unexpectedly; sleep protection was lost.`));
      return {unexpectedExit,async release(){if(released)return;released=true;active=false;child.kill('SIGTERM');if(await exitedWithin(child.exited,1000))return;child.kill('SIGKILL');if(!(await exitedWithin(child.exited,500)))throw new Error(`${spec.command} did not terminate; sleep protection state is unknown.`);}};
    }
  };
}

function executableExists(command:string):boolean {
  if (existsSync(command)) return true;
  return Boolean(process.env.PATH?.split(delimiter).some(path=>existsSync(join(path,command)) || (process.platform==='win32'&&existsSync(join(path,`${command}.exe`)))));
}
function spawnDetached(command:string,args:string[]):Spawned {
  const child=nodeSpawn(command,args,{stdio:'ignore',windowsHide:true});
  return {pid:child.pid,kill:signal=>child.kill(signal),exited:new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);})};
}
async function exitedWithin(exited:Promise<unknown>,milliseconds:number){return Promise.race([exited.then(()=>true),new Promise<false>(resolve=>setTimeout(()=>resolve(false),milliseconds))]);}
