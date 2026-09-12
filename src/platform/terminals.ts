import {spawn,type ChildProcess,type SpawnOptions} from 'node:child_process';
import {posix,win32} from 'node:path';
import {resolveCommandDetails} from './executables.js';
import {identifyPlatform,nativeAdapters} from './runtime.js';
import {powershellCommand} from './shell.js';
import {launchEnvironment, nodeLaunchCommand, waitForLaunch} from './launch-command.js';

export type TerminalResolver=(command:string)=>string|undefined;
type TerminalSpawn=(command:string,args:readonly string[],options?:SpawnOptions)=>ChildProcess;
export type TerminalOptions={platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;resolve?:TerminalResolver;spawn?:TerminalSpawn};
type TerminalCommand=TerminalOptions&{nodePath:string;args:readonly string[];title?:string;closeOnExit?:boolean};
type TerminalLaunch={terminal:string;command:string;args:string[];environment?:Record<string,string>};

type UnixTerminal={name:string;args:string[];display?:'x11'|'wayland';shell?:boolean};
const unixTerminals:UnixTerminal[]=[
  {name:'ghostty',args:['-e']},{name:'wezterm',args:['start','--always-new-process','--']},
  {name:'kitty',args:['-e']},{name:'gnome-terminal',args:['--']},{name:'konsole',args:['-e']},
  {name:'xfce4-terminal',args:['-x']},{name:'x-terminal-emulator',args:['-e'],shell:true},
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
    const separator=configured.indexOf(':');const prefix=separator<0?'':configured.slice(0,separator);
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
  const environment=launchEnvironment(env,{platform});
  const direct=nodeLaunchCommand(options.nodePath,options.args,environment);
  if(terminal.endsWith(':unsupported')){
    if(nativeAdapters(identifyPlatform({platform,env})).terminal==='unix'&&!hasDisplay(env))throw new Error('No graphical desktop session is available: DISPLAY and WAYLAND_DISPLAY are unset. Open radiocli manually for controls.');
    throw new Error('No supported installed graphical terminal was found. Open radiocli manually for controls.');
  }
  if(terminal==='darwin:apple-terminal'||terminal==='darwin:iterm'){
    const command=`${direct.map(shellQuote).join(' ')}${options.closeOnExit?'; exit':''}`;
    return{terminal,command:'/usr/bin/osascript',args:terminal==='darwin:apple-terminal'?appleTerminalScript(command):iTermScript(command)};
  }
  if(terminal==='darwin:wezterm')return{terminal,command:'/usr/bin/open',args:['-na','WezTerm','--args','start','--always-new-process','--',...direct]};
  if(terminal==='darwin:ghostty')return{terminal,command:'/usr/bin/open',args:['-na','Ghostty','--args','-e',...direct]};
  if(terminal==='darwin:kitty')return{terminal,command:'/usr/bin/open',args:['-na','kitty','--args','--detach',...direct]};
  if(terminal.startsWith('win32:')){
    const systemRoot=env.SystemRoot??env.WINDIR;
    const powershell=resolve('powershell.exe')??(systemRoot?resolve(win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe')):undefined)??resolve('pwsh.exe');
    if(!powershell)throw new Error('PowerShell is unavailable; a RadioCLI terminal cannot be requested.');
    // PowerShell 5 does not preserve arbitrary native argv quoting. Only a
    // fixed quote-free Node program and encoded JSON cross that boundary.
    const args=powershellCommand(direct,{}, {keepOpen:!options.closeOnExit});
    if(terminal==='win32:console')return{terminal,command:powershell,...newWindowsConsole(powershell,args)};
    const wt=resolve('wt.exe')??(env.LOCALAPPDATA?resolve(win32.join(env.LOCALAPPDATA,'Microsoft','WindowsApps','wt.exe')):undefined);
    if(!wt)throw new Error('Windows Terminal is unavailable; the saved terminal cannot be requested.');
    return{terminal,command:wt,args:['-w','new','new-tab','--title',options.title??'RadioCLI',powershell,...args]};
  }
  const executable=terminal.slice(terminal.indexOf(':')+1);const spec=unixTerminals.find(item=>item.name===posix.basename(executable));
  if(!spec)throw new Error('The saved graphical terminal is unsupported.');
  // QTerminal reparses only its first -e argument, then appends argv literally.
  // The alternatives alias can select QTerminal too, so both use the fixed
  // POSIX shell boundary. This also preserves argv for ordinary -e terminals.
  if(spec.shell){const sh=resolve('/bin/sh');if(!sh)throw new Error('The POSIX shell required by this terminal is unavailable.');return{terminal,command:executable,args:[...spec.args,sh,'-c',direct.map(shellQuote).join(' ')]};}
  return{terminal,command:executable,args:[...spec.args,...direct]};
}

/** Request acceptance is separate from the caller's TUI/session verification. */
export async function launchTerminalCommand(options:TerminalCommand):Promise<string>{
  const plan=createTerminalLaunch(options);
  // PowerShell can exit without executing its script under DETACHED_PROCESS.
  // Keep this short-lived bootstrap attached until it creates the independent
  // console. The new console, not its bootstrap, owns the interactive handles.
  // https://github.com/nodejs/node/issues/51018
  const consoleBootstrap=plan.terminal==='win32:console';
  const child=(options.spawn??spawn)(plan.command,plan.args,{env:{...(options.env??process.env),...plan.environment},detached:!consoleBootstrap,stdio:'ignore',windowsHide:consoleBootstrap});
  await waitForLaunch(child,{waitForExit:consoleBootstrap});return plan.terminal;
}

function resolver(platform:NodeJS.Platform,env:NodeJS.ProcessEnv):TerminalResolver{return command=>resolveCommandDetails(command,{platform,env}).path??undefined;}
function hasDisplay(env:NodeJS.ProcessEnv){return Boolean(env.DISPLAY?.trim()||env.WAYLAND_DISPLAY?.trim());}
function resolveUnixTerminal(input:string,env:NodeJS.ProcessEnv,resolve:TerminalResolver):string|undefined{
  const spec=unixTerminals.find(item=>item.name===posix.basename(input).toLowerCase());
  if(!spec||spec.display==='x11'&&!env.DISPLAY?.trim()||spec.display==='wayland'&&!env.WAYLAND_DISPLAY?.trim())return undefined;
  const path=resolve(input);return path&&unixTerminals.some(item=>item.name===posix.basename(path))?path:undefined;
}
function shellQuote(value:string):string{return`'${value.replaceAll("'",`'\\''`)}'`;}
function newWindowsConsole(powershell: string, args: readonly string[]): {args: string[]; environment: Record<string, string>} {
  const key = 'RADIOCLI_WINDOWS_CONSOLE_COMMAND';
  // The transient launcher has NUL stdio. CreateProcessW explicitly creates
  // new console buffers without inheriting those handles; STARTF_USESTDHANDLES
  // must stay unset. ShellExecute-based Start-Process does not provide this
  // handle contract. Only fixed flags and encoded data enter the argument string.
  // https://learn.microsoft.com/en-us/windows/console/creation-of-a-console
  // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
  const native = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class RadioCliConsole {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct StartupInfo {
    public uint cb;
    public string lpReserved, lpDesktop, lpTitle;
    public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct ProcessInformation {
    public IntPtr hProcess, hThread;
    public uint dwProcessId, dwThreadId;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CreateProcessW(string application, StringBuilder commandLine,
    IntPtr processAttributes, IntPtr threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
    uint creationFlags, IntPtr environment, string currentDirectory, ref StartupInfo startup,
    out ProcessInformation process);
  [DllImport("kernel32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CloseHandle(IntPtr handle);
  public static void Launch(string application, string arguments) {
    var commandLine = new StringBuilder("\"" + application + "\" " + arguments);
    if (commandLine.Length >= 32767) throw new ArgumentException("The Windows console command exceeds the native command-line limit.");
    var startup = new StartupInfo();
    startup.cb = (uint)Marshal.SizeOf(typeof(StartupInfo));
    startup.dwFlags = 0x00000001; // STARTF_USESHOWWINDOW only; no inherited standard handles.
    startup.wShowWindow = 1; // SW_SHOWNORMAL
    ProcessInformation process;
    if (!CreateProcessW(application, commandLine, IntPtr.Zero, IntPtr.Zero, false,
      0x00000010, IntPtr.Zero, null, ref startup, out process)) { // CREATE_NEW_CONSOLE
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
  }
}`;
  const script = [
    "$ErrorActionPreference='Stop'",
    "$ProgressPreference='SilentlyContinue'",
    `$radiocliConsole=[Environment]::GetEnvironmentVariable('${key}','Process') | ConvertFrom-Json`,
    `[Environment]::SetEnvironmentVariable('${key}',$null,'Process')`,
    `Add-Type -TypeDefinition '${native.replaceAll("'", "''")}'`,
    "[RadioCliConsole]::Launch([string]$radiocliConsole.command, [string]::Join(' ', [string[]]$radiocliConsole.args))"
  ].join(';');
  // Only this short-lived outer process needs the handoff. Encoding the inner
  // PowerShell command again exceeds Windows' command-line limit for ordinary
  // deep install paths. Clear the private variable before creating the console.
  return {
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    environment: {[key]: JSON.stringify({command: powershell, args})}
  };
}
function appleTerminalScript(command:string):string[]{return['-e','on run argv','-e','tell application "Terminal"','-e','activate','-e','do script (item 1 of argv)','-e','end tell','-e','end run',command];}
function iTermScript(command:string):string[]{return['-e','on run argv','-e','tell application "iTerm"','-e','activate','-e','set w to (create window with default profile)','-e','tell current session of w to write text (item 1 of argv)','-e','end tell','-e','end run',command];}
