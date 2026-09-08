import {spawn,type ChildProcess} from 'node:child_process';
import {posix,win32} from 'node:path';
import {resolveCommandDetails} from './executables.js';
import {identifyPlatform,nativeAdapters} from './runtime.js';
import {powershellCommand} from './shell.js';

export type TerminalResolver=(command:string)=>string|undefined;
type TerminalSpawn=(command:string,args:readonly string[])=>ChildProcess;
export type TerminalOptions={platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;resolve?:TerminalResolver;spawn?:TerminalSpawn};
type TerminalCommand=TerminalOptions&{nodePath:string;args:readonly string[];title?:string;closeOnExit?:boolean};
type TerminalLaunch={terminal:string;command:string;args:string[]};

type UnixTerminal={name:string;args:string[];display?:'x11'|'wayland';shell?:boolean};
const unixTerminals:UnixTerminal[]=[
  {name:'ghostty',args:['-e']},{name:'wezterm',args:['start','--always-new-process','--']},
  {name:'kitty',args:['-e']},{name:'gnome-terminal',args:['--']},{name:'konsole',args:['-e']},
  {name:'xfce4-terminal',args:['-x']},{name:'x-terminal-emulator',args:['-e']},
  {name:'alacritty',args:['-e']},{name:'foot',args:['--'],display:'wayland'},
  {name:'mate-terminal',args:['-x']},{name:'qterminal',args:['-e'],shell:true},
  {name:'terminator',args:['-x']},{name:'tilix',args:['-e']},
  {name:'xterm',args:['-e'],display:'x11'},{name:'uxterm',args:['-e'],display:'x11'}
];
const macTerminals=['darwin:apple-terminal','darwin:iterm','darwin:wezterm','darwin:ghostty','darwin:kitty'];

export function detectGraphicalTerminal(platform:NodeJS.Platform=process.platform,env:NodeJS.ProcessEnv=process.env,resolve:TerminalResolver=resolver(platform,env)):string{
  const host=identifyPlatform({platform,env});const adapter=nativeAdapters(host).terminal;
  const unsupported=`${host.id==='unknown'?platform:host.id}:unsupported`;
  const configured=env.RADIOCLI_ALARM_TERMINAL?.trim();
  if(adapter==='macos'){
    if(configured&&macTerminals.includes(configured))return configured;
    const program=`${env.TERM_PROGRAM??''} ${env.__CFBundleIdentifier??''}`.toLowerCase();
    for(const name of ['iterm','wezterm','ghostty','kitty'])if(program.includes(name))return`darwin:${name}`;
    return'darwin:apple-terminal';
  }
  if(adapter==='windows'){
    if(configured==='win32:windows-terminal'||configured==='win32:console')return configured;
    return env.WT_SESSION?'win32:windows-terminal':'win32:console';
  }
  if(adapter!=='unix'||!hasDisplay(env))return unsupported;
  if(configured){
    const separator=configured.indexOf(':');const prefix=configured.slice(0,separator);
    if(prefix===host.id||prefix==='linux'){
      const path=resolveUnixTerminal(configured.slice(separator+1),env,resolve);
      return path?`${prefix}:${path}`:unsupported;
    }
  }
  const requested=env.TERMINAL?.trim()||env.TERM_PROGRAM?.trim();
  const selected=requested&&resolveUnixTerminal(requested,env,resolve);
  if(selected)return`${host.id}:${selected}`;
  for(const terminal of unixTerminals){const path=resolveUnixTerminal(terminal.name,env,resolve);if(path)return`${host.id}:${path}`;}
  return unsupported;
}

export function createTerminalLaunch(options:TerminalCommand):TerminalLaunch{
  const platform=options.platform??process.platform;const env=options.env??process.env;const resolve=options.resolve??resolver(platform,env);
  const terminal=detectGraphicalTerminal(platform,env,resolve);const values=[options.nodePath,...options.args];
  if(values.some(value=>value.includes('\0')))throw new Error('Terminal command values cannot contain NUL bytes.');
  const home=env.RADIOCLI_HOME;
  if(terminal.endsWith(':unsupported')){
    if(nativeAdapters(identifyPlatform({platform,env})).terminal==='unix'&&!hasDisplay(env))throw new Error('No graphical desktop session is available: DISPLAY and WAYLAND_DISPLAY are unset. Open radiocli manually for controls.');
    throw new Error('No supported installed graphical terminal was found. Open radiocli manually for controls.');
  }
  if(terminal==='darwin:apple-terminal'||terminal==='darwin:iterm'){
    const command=`${home!==undefined?`RADIOCLI_HOME=${shellQuote(home)} `:''}${values.map(shellQuote).join(' ')}${options.closeOnExit?'; exit':''}`;
    return{terminal,command:'/usr/bin/osascript',args:terminal==='darwin:apple-terminal'?appleTerminalScript(command):iTermScript(command)};
  }
  const direct=home===undefined?values:nodeBootstrap(options.nodePath,options.args,{RADIOCLI_HOME:home});
  if(terminal==='darwin:wezterm')return{terminal,command:'/usr/bin/open',args:['-na','WezTerm','--args','start','--always-new-process','--',...direct]};
  if(terminal==='darwin:ghostty')return{terminal,command:'/usr/bin/open',args:['-na','Ghostty','--args','-e',...direct]};
  if(terminal==='darwin:kitty')return{terminal,command:'/usr/bin/open',args:['-na','kitty','--args','--detach',...direct]};
  if(terminal.startsWith('win32:')){
    const systemRoot=env.SystemRoot??env.WINDIR;
    const powershell=resolve('powershell.exe')??(systemRoot?resolve(win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe')):undefined)??resolve('pwsh.exe');
    if(!powershell)throw new Error('PowerShell is unavailable; a RadioCLI terminal cannot be requested.');
    // PowerShell 5 does not preserve arbitrary native argv quoting. Only a
    // fixed quote-free Node program and encoded JSON cross that boundary.
    const command=nodeBootstrap(options.nodePath,options.args,home===undefined?{}:{RADIOCLI_HOME:home});
    const args=powershellCommand(command,{}, {keepOpen:!options.closeOnExit});
    if(terminal==='win32:console')return{terminal,command:powershell,args};
    const wt=resolve('wt.exe')??(env.LOCALAPPDATA?resolve(win32.join(env.LOCALAPPDATA,'Microsoft','WindowsApps','wt.exe')):undefined);
    if(!wt)throw new Error('Windows Terminal is unavailable; the saved terminal cannot be requested.');
    return{terminal,command:wt,args:['-w','new','new-tab','--title',options.title??'RadioCLI',powershell,...args]};
  }
  const executable=terminal.slice(terminal.indexOf(':')+1);const spec=unixTerminals.find(item=>item.name===posix.basename(executable));
  if(!spec)throw new Error('The saved graphical terminal is unsupported.');
  // qterminal reparses its first -e argument as a command string. A fixed
  // POSIX shell keeps a Node path containing quotes/spaces out of that parser.
  if(spec.shell){const sh=resolve('/bin/sh');if(!sh)throw new Error('The POSIX shell required by qterminal is unavailable.');return{terminal,command:executable,args:[...spec.args,sh,'-c',direct.map(shellQuote).join(' ')]};}
  return{terminal,command:executable,args:[...spec.args,...direct]};
}

/** Request acceptance is separate from the caller's TUI/session verification. */
export async function launchTerminalCommand(options:TerminalCommand):Promise<string>{
  const plan=createTerminalLaunch(options);
  const child=options.spawn?options.spawn(plan.command,plan.args):spawn(plan.command,plan.args,{env:options.env??process.env,detached:true,stdio:'ignore',windowsHide:false});
  await waitForLaunch(child);return plan.terminal;
}

export function waitForLaunch(child:ChildProcess):Promise<void>{
  return new Promise((resolve,reject)=>{
    let settled=false;let acceptedTimer:NodeJS.Timeout|undefined;
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(startupTimer);if(acceptedTimer)clearTimeout(acceptedTimer);if(error)reject(error);else resolve();};
    const startupTimer=setTimeout(()=>finish(new Error('Terminal launcher did not report process startup.')),3_000);
    child.once('error',error=>finish(error));
    child.once('close',(code,signal)=>finish(code===0?undefined:new Error(`Terminal launcher exited with ${code??signal??'unknown status'}.`)));
    child.once('spawn',()=>{child.unref();acceptedTimer=setTimeout(()=>finish(),100);});
  });
}

function resolver(platform:NodeJS.Platform,env:NodeJS.ProcessEnv):TerminalResolver{return command=>resolveCommandDetails(command,{platform,env}).path??undefined;}
function hasDisplay(env:NodeJS.ProcessEnv){return Boolean(env.DISPLAY?.trim()||env.WAYLAND_DISPLAY?.trim());}
function resolveUnixTerminal(input:string,env:NodeJS.ProcessEnv,resolve:TerminalResolver):string|undefined{
  const spec=unixTerminals.find(item=>item.name===posix.basename(input).toLowerCase());
  if(!spec||spec.display==='x11'&&!env.DISPLAY?.trim()||spec.display==='wayland'&&!env.WAYLAND_DISPLAY?.trim())return undefined;
  const path=resolve(input);return path&&unixTerminals.some(item=>item.name===posix.basename(path))?path:undefined;
}
function shellQuote(value:string):string{return`'${value.replaceAll("'",`'\\''`)}'`;}
function nodeBootstrap(nodePath:string,args:readonly string[],environment:Record<string,string>):string[]{
  const program="const p=JSON.parse(Buffer.from(process.argv[1],'base64url').toString('utf8'));const r=require('node:child_process').spawnSync(process.execPath,p.args,{stdio:'inherit',env:{...process.env,...p.environment}});if(r.error)console.error(r.error.message);process.exit(r.status??1);";
  return[nodePath,'-e',program,Buffer.from(JSON.stringify({args,environment}),'utf8').toString('base64url')];
}
function appleTerminalScript(command:string):string[]{return['-e','on run argv','-e','tell application "Terminal"','-e','activate','-e','do script (item 1 of argv)','-e','end tell','-e','end run',command];}
function iTermScript(command:string):string[]{return['-e','on run argv','-e','tell application "iTerm"','-e','activate','-e','set w to (create window with default profile)','-e','tell current session of w to write text (item 1 of argv)','-e','end tell','-e','end run',command];}
