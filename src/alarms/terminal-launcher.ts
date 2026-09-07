import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer, type Socket} from 'node:net';
import {randomBytes} from 'node:crypto';
import {basename, delimiter, join} from 'node:path';
import {listenLoopback} from '../platform/loopback.js';

export type AlarmTerminalLaunchResult = {opened: boolean; terminal: string; message: string};
type Spawn = (command: string, args: readonly string[]) => ChildProcess;
type LaunchOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nodePath: string;
  cliPath: string;
  spawn?: Spawn;
  hasLiveTui?: () => boolean;
};
type PermissionOptions={platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;spawn?:Spawn;permissionTimeoutMs?:number};
type ProbeOptions=PermissionOptions&{nodePath?:string;timeoutMs?:number};

const linuxTerminals = new Set(['alacritty','foot','ghostty','gnome-terminal','kitty','konsole','mate-terminal','qterminal','terminator','tilix','wezterm','xfce4-terminal','x-terminal-emulator']);

export function detectAlarmTerminal(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RADIOCLI_ALARM_TERMINAL?.trim();
  if (configured && validDescriptor(configured, platform)) return configured;
  if (platform === 'darwin') {
    const program = `${env.TERM_PROGRAM ?? ''} ${env.__CFBundleIdentifier ?? ''}`.toLowerCase();
    if (program.includes('iterm')) return 'darwin:iterm';
    if (program.includes('wezterm')) return 'darwin:wezterm';
    if (program.includes('ghostty')) return 'darwin:ghostty';
    if (program.includes('kitty')) return 'darwin:kitty';
    return 'darwin:apple-terminal';
  }
  if (platform === 'win32') return env.WT_SESSION ? 'win32:windows-terminal' : 'win32:console';
  if (platform === 'linux') {
    const requested = env.TERMINAL?.trim() || env.TERM_PROGRAM?.trim();
    const resolved = requested ? resolveExecutable(requested, env) : undefined;
    if (resolved && linuxTerminals.has(basename(resolved))) return `linux:${resolved}`;
    for (const command of ['ghostty','wezterm','kitty','gnome-terminal','konsole','xfce4-terminal','x-terminal-emulator']) {
      const path = resolveExecutable(command, env); if (path) return `linux:${path}`;
    }
  }
  return `${platform}:unsupported`;
}

export async function openAlarmControls(options: LaunchOptions): Promise<AlarmTerminalLaunchResult> {
  if (options.hasLiveTui?.()) return {opened:false,terminal:'existing-tui',message:'An existing RadioCLI TUI will show the ringing controls.'};
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const terminal = detectAlarmTerminal(platform, env);
  const command = shellCommand(options.nodePath, options.cliPath, env.RADIOCLI_HOME);
  const directArgs = environmentCommand(options.nodePath, options.cliPath, env.RADIOCLI_HOME);
  const launch = options.spawn ?? spawnDetached;
  if (terminal === 'darwin:apple-terminal') await launched(launch('/usr/bin/osascript', appleTerminalScript(command)));
  else if (terminal === 'darwin:iterm') await launched(launch('/usr/bin/osascript', iTermScript(command)));
  else if (terminal === 'darwin:wezterm') await launched(launch('/usr/bin/open', ['-na','WezTerm','--args','start','--always-new-process','--',...directArgs]));
  else if (terminal === 'darwin:ghostty') await launched(launch('/usr/bin/open', ['-na','Ghostty','--args','-e',...directArgs]));
  else if (terminal === 'darwin:kitty') await launched(launch('/usr/bin/open', ['-na','kitty','--args','--detach',...directArgs]));
  else if (terminal === 'win32:windows-terminal') await launched(launch('wt.exe', ['-w','new','new-tab','--title','RadioCLI Alarm',options.nodePath,options.cliPath]));
  else if (terminal === 'win32:console') await launched(launch('cmd.exe', ['/d','/c','start','RadioCLI Alarm','cmd.exe','/k',windowsCommand(options.nodePath,options.cliPath,env.RADIOCLI_HOME)]));
  else if (terminal.startsWith('linux:')) {
    const executable = terminal.slice('linux:'.length); if (!linuxTerminals.has(basename(executable))) throw new Error('Saved Linux terminal is not supported.');
    const name = basename(executable); const prefix = name === 'gnome-terminal' || name === 'mate-terminal' || name === 'xfce4-terminal' ? ['--'] : name === 'wezterm' ? ['start','--always-new-process','--'] : ['-e'];
    await launched(launch(executable,[...prefix,...directArgs]));
  } else throw new Error('No supported graphical terminal was found. Open radiocli manually and press ! for alarm controls.');
  return {opened:true,terminal,message:'Opened RadioCLI alarm controls in the saved terminal.'};
}

/** Ask for macOS Automation access while the user is configuring the alarm. */
export async function prepareAlarmTerminalAccess(options:PermissionOptions={}):Promise<void>{
  const platform=options.platform??process.platform;if(platform!=='darwin')return;
  const terminal=detectAlarmTerminal(platform,options.env??process.env);const application=terminal==='darwin:apple-terminal'?'Terminal':terminal==='darwin:iterm'?'iTerm':undefined;if(!application)return;
  const launch=options.spawn??spawnAttached;const child=launch('/usr/bin/osascript',['-e',`tell application "${application}" to count windows`]);
  const code=await completed(child,options.permissionTimeoutMs??60_000);if(code!==0)throw new Error(`macOS did not grant RadioCLI permission to control ${application}. Audio can still play, but automatic ringing controls cannot open. Enable Node under System Settings > Privacy & Security > Automation, then press Repair.`);
}

/**
 * Opens the saved terminal with a short-lived authenticated loopback probe. The
 * terminal exits immediately after proving that a native background job can
 * expose the ringing TUI on this desktop session.
 */
export async function verifyAlarmTerminalLaunch(options:ProbeOptions={}):Promise<string>{
  const platform=options.platform??process.platform;const env=options.env??process.env;
  await prepareAlarmTerminalAccess(options);
  const terminal=detectAlarmTerminal(platform,env);if(terminal.endsWith(':unsupported'))throw new Error('No supported graphical terminal was found for automatic alarm controls.');
  const token=randomBytes(24).toString('base64url');const server=createServer();
  const address=await listenLoopback(server);
  const script="const n=require('node:net');const s=n.connect(Number(process.argv[1]),process.argv[3],()=>s.end(process.argv[2]));s.on('error',()=>process.exit(2));";
  const direct=[options.nodePath??process.execPath,'-e',script,String(address.port),token,address.host];
  const command=`${direct.map(shellQuote).join(' ')}; exit`;
  const launch=options.spawn??spawnDetached;
  const sockets=new Set<Socket>();
  const received=new Promise<void>((resolve,reject)=>{server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));let value='';socket.setEncoding('utf8');socket.on('data',chunk=>{value+=chunk;if(value.length>token.length){socket.destroy();reject(new Error('The terminal verification response was not authentic.'));}});socket.on('end',()=>value===token?resolve():reject(new Error('The terminal verification response was not authentic.')));socket.on('error',reject);});});
  // A callback can fail while the launcher is still reporting its own result.
  // Keep the rejection observed until it is awaited below.
  void received.catch(()=>undefined);
  try{
    if(terminal==='darwin:apple-terminal')await launched(launch('/usr/bin/osascript',appleTerminalScript(command)));
    else if(terminal==='darwin:iterm')await launched(launch('/usr/bin/osascript',iTermScript(command)));
    else if(terminal==='darwin:wezterm')await launched(launch('/usr/bin/open',['-na','WezTerm','--args','start','--always-new-process','--',...direct]));
    else if(terminal==='darwin:ghostty')await launched(launch('/usr/bin/open',['-na','Ghostty','--args','-e',...direct]));
    else if(terminal==='darwin:kitty')await launched(launch('/usr/bin/open',['-na','kitty','--args','--detach',...direct]));
    else if(terminal==='win32:windows-terminal')await launched(launch('wt.exe',['-w','new','new-tab','--title','RadioCLI Alarm Verification',...direct]));
    else if(terminal==='win32:console')await launched(launch('cmd.exe',['/d','/c','start','RadioCLI Alarm Verification','cmd.exe','/c',windowsCommandArgs(direct)]));
    else if(terminal.startsWith('linux:')){const executable=terminal.slice(6);const name=basename(executable);const prefix=name==='gnome-terminal'||name==='mate-terminal'||name==='xfce4-terminal'?['--']:name==='wezterm'?['start','--always-new-process','--']:['-e'];await launched(launch(executable,[...prefix,...direct]));}
    else throw new Error('The saved terminal is not supported for alarm controls.');
    await withTimeout(received,options.timeoutMs??8_000,'The terminal opened but did not connect back to RadioCLI.');
    return terminal;
  }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

function validDescriptor(value:string,platform:NodeJS.Platform):boolean {
  if(platform==='darwin')return['darwin:apple-terminal','darwin:iterm','darwin:wezterm','darwin:ghostty','darwin:kitty'].includes(value);
  if(platform==='win32')return value==='win32:windows-terminal'||value==='win32:console';
  if(platform==='linux'&&value.startsWith('linux:'))return linuxTerminals.has(basename(value.slice(6)));
  return false;
}
function resolveExecutable(input:string,env:NodeJS.ProcessEnv):string|undefined {
  if(input.includes('/')&&existsSync(input))return input;
  for(const directory of (env.PATH??'').split(delimiter)){const path=join(directory,input);if(existsSync(path))return path;}
  return undefined;
}
function shellQuote(value:string):string{return `'${value.replaceAll("'",`'\\''`)}'`;}
function shellCommand(nodePath:string,cliPath:string,home?:string):string{return `${home?`RADIOCLI_HOME=${shellQuote(home)} `:''}${shellQuote(nodePath)} ${shellQuote(cliPath)}`;}
function environmentCommand(nodePath:string,cliPath:string,home?:string):string[]{return home?['/usr/bin/env',`RADIOCLI_HOME=${home}`,nodePath,cliPath]:[nodePath,cliPath];}
function windowsCommand(nodePath:string,cliPath:string,home?:string):string{return `${home?`set "RADIOCLI_HOME=${cmdEscape(home)}" && `:''}"${nodePath.replaceAll('"','""')}" "${cliPath.replaceAll('"','""')}"`;}
function windowsCommandArgs(values:string[]):string{return values.map(value=>`"${value.replaceAll('"','""')}"`).join(' ');}
function cmdEscape(value:string){return value.replaceAll('%','%%').replaceAll('"','""').replaceAll('^','^^').replaceAll('&','^&').replaceAll('|','^|').replaceAll('<','^<').replaceAll('>','^>');}
function appleTerminalScript(command:string):string[]{return['-e','on run argv','-e','tell application "Terminal"','-e','activate','-e','do script (item 1 of argv)','-e','end tell','-e','end run',command];}
function iTermScript(command:string):string[]{return['-e','on run argv','-e','tell application "iTerm"','-e','activate','-e','set w to (create window with default profile)','-e','tell current session of w to write text (item 1 of argv)','-e','end tell','-e','end run',command];}
function spawnDetached(command:string,args:readonly string[]):ChildProcess{return spawn(command,[...args],{detached:true,stdio:'ignore',windowsHide:false});}
function spawnAttached(command:string,args:readonly string[]):ChildProcess{return spawn(command,[...args],{stdio:'ignore',windowsHide:true});}
function launched(child:ChildProcess):Promise<void>{return new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});}
function completed(child:ChildProcess,timeoutMs:number):Promise<number>{return new Promise((resolve,reject)=>{let settled=false;const finish=(work:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);work();};const timer=setTimeout(()=>{child.kill('SIGTERM');finish(()=>reject(new Error('Timed out waiting for the macOS Automation permission response.')));},timeoutMs);child.once('error',error=>finish(()=>reject(error)));child.once('close',code=>finish(()=>resolve(code??1)));});}
async function withTimeout<T>(promise:Promise<T>,milliseconds:number,message:string):Promise<T>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]);}finally{if(timer)clearTimeout(timer);}}
