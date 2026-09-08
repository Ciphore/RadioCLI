import {EventEmitter} from 'node:events';
import {spawn as nodeSpawn,type ChildProcess} from 'node:child_process';
import {connect, type Socket} from 'node:net';
import {describe,expect,it,vi} from 'vitest';
import {openAlarmControls,prepareAlarmTerminalAccess,verifyAlarmTerminalLaunch} from './terminal-launcher.js';
import {detectGraphicalTerminal} from '../platform/terminals.js';

function spawnRecorder(){
  const calls:Array<{command:string;args:readonly string[]}>=[];
  const spawn=vi.fn((command:string,args:readonly string[])=>{calls.push({command,args});const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();queueMicrotask(()=>child.emit('spawn'));return child;});
  return{calls,spawn};
}
function powershellInvocation(args: readonly string[]): {command: string; args: string[]} {
  const index = args.indexOf('-EncodedCommand');
  expect(index).toBeGreaterThanOrEqual(0);
  const script = Buffer.from(args[index + 1]!, 'base64').toString('utf16le');
  const encoded = /FromBase64String\('([^']+)'\)/.exec(script)?.[1];
  expect(encoded).toBeDefined();
  return JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8'));
}
function bootstrapPayload(args: readonly string[]): {args: string[]; environment: Record<string, string>} {
  return JSON.parse(Buffer.from(args.at(-1)!, 'base64url').toString('utf8'));
}

describe('alarm terminal launcher',()=>{
  it('remembers recognizable terminal emulators per platform',()=>{
    expect(detectGraphicalTerminal('darwin',{TERM_PROGRAM:'iTerm.app'})).toBe('darwin:iterm');
    expect(detectGraphicalTerminal('darwin',{})).toBe('darwin:apple-terminal');
    expect(detectGraphicalTerminal('win32',{WT_SESSION:'1'})).toBe('win32:windows-terminal');
    expect(detectGraphicalTerminal('win32',{})).toBe('win32:console');
  });

  it('opens Apple Terminal with RadioCLI and its saved data home',async()=>{
    const recorded=spawnRecorder();
    const result=await openAlarmControls({platform:'darwin',env:{RADIOCLI_ALARM_TERMINAL:'darwin:apple-terminal',RADIOCLI_HOME:"/Data/O'Brien"},nodePath:'/usr/bin/node',cliPath:'/app/cli.js',spawn:recorded.spawn});
    expect(result).toMatchObject({opened:false,requested:true,message:expect.stringMatching(/requested.*unverified/i)});
    expect(recorded.calls[0]?.command).toBe('/usr/bin/osascript');
    const shell=recorded.calls[0]!.args.at(-1)!;
    expect(shell.startsWith("'/usr/bin/node' '-e' ")).toBe(true);
    const encoded=/'([A-Za-z0-9_-]+)'$/.exec(shell)?.[1];expect(encoded).toBeDefined();
    expect(bootstrapPayload([encoded!])).toEqual({args:['/app/cli.js'],environment:{RADIOCLI_HOME:"/Data/O'Brien"}});
  });

  it('reports opened only after the new TUI becomes observable',async()=>{const recorded=spawnRecorder();const hasLiveTui=vi.fn().mockReturnValueOnce(false).mockReturnValue(true);const result=await openAlarmControls({platform:'darwin',env:{},nodePath:'/node',cliPath:'/cli.js',spawn:recorded.spawn,hasLiveTui,timeoutMs:100});expect(result).toMatchObject({opened:true,requested:true});expect(hasLiveTui).toHaveBeenCalledTimes(2);});

  it('distinguishes an accepted launch request from a TUI that never appears',async()=>{const recorded=spawnRecorder();const result=await openAlarmControls({platform:'darwin',env:{},nodePath:'/node',cliPath:'/cli.js',spawn:recorded.spawn,hasLiveTui:()=>false,timeoutMs:20});expect(result).toMatchObject({opened:false,requested:true,message:expect.stringMatching(/requested.*did not become ready/i)});});

  it('rejects native launcher failure even when a process was spawned',async()=>{const launch=vi.fn(()=>{const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();queueMicrotask(()=>{child.emit('spawn');child.emit('close',1);});return child;});await expect(openAlarmControls({platform:'darwin',env:{},nodePath:'/node',cliPath:'/cli.js',spawn:launch})).rejects.toThrow(/terminal.*exit|launcher.*exit/i);});

  it('requests the saved Windows Terminal with its literal data home in a new tab',async()=>{
    const recorded=spawnRecorder();
    const home='C:\\Radio %PATH%! & "quotes" 单播';
    await openAlarmControls({platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:'win32:windows-terminal',RADIOCLI_HOME:home},nodePath:'C:\\Node\\node.exe',cliPath:'C:\\RadioCLI\\cli.js',spawn:recorded.spawn,resolve:command=>command});
    expect(recorded.calls[0]?.command).toBe('wt.exe');
    expect(recorded.calls[0]?.args.slice(0,7)).toEqual(['-w','new','new-tab','--title','RadioCLI Alarm','powershell.exe','-NoLogo']);
    const invocation=powershellInvocation(recorded.calls[0]!.args);
    expect(invocation.command).toBe('C:\\Node\\node.exe');
    expect(bootstrapPayload(invocation.args)).toEqual({args:['C:\\RadioCLI\\cli.js'],environment:{RADIOCLI_HOME:home}});
  });

  it.each(['freebsd','openbsd','netbsd'] as const)('requests an installed graphical terminal on %s',async platform=>{
    const recorded=spawnRecorder();const result=await openAlarmControls({platform,env:{DISPLAY:':0',TERMINAL:'xterm'},nodePath:'/node',cliPath:'/cli.js',spawn:recorded.spawn,resolve:command=>command==='xterm'?'/usr/local/bin/xterm':undefined});
    expect(result).toMatchObject({opened:false,requested:true,terminal:`${platform}:/usr/local/bin/xterm`});
    expect(recorded.calls[0]!.command).toBe('/usr/local/bin/xterm');expect(recorded.calls[0]!.args.slice(0,3)).toEqual(['-e','/node','-e']);
    expect(bootstrapPayload(recorded.calls[0]!.args)).toEqual({args:['/cli.js'],environment:{}});
  });

  it('does not open a second terminal when a RadioCLI TUI is already live',async()=>{
    const recorded=spawnRecorder();
    const result=await openAlarmControls({platform:'linux',env:{RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/kitty'},nodePath:'/node',cliPath:'/cli.js',spawn:recorded.spawn,hasLiveTui:()=>true});
    expect(result).toMatchObject({opened:false,terminal:'existing-tui'});
    expect(recorded.spawn).not.toHaveBeenCalled();
  });

  it('requests macOS terminal Automation access during setup rather than at firing time',async()=>{const calls:Array<{command:string;args:readonly string[]}>=[];const spawn=vi.fn((command:string,args:readonly string[])=>{calls.push({command,args});const child=new EventEmitter() as ChildProcess;queueMicrotask(()=>child.emit('close',0));return child;});await prepareAlarmTerminalAccess({platform:'darwin',env:{RADIOCLI_ALARM_TERMINAL:'darwin:apple-terminal'},spawn});expect(calls[0]).toEqual({command:'/usr/bin/osascript',args:['-e','tell application "Terminal" to count windows']});});

  it('surfaces a denied macOS terminal permission without affecting other platforms',async()=>{const spawn=vi.fn(()=>{const child=new EventEmitter() as ChildProcess;queueMicrotask(()=>child.emit('close',1));return child;});await expect(prepareAlarmTerminalAccess({platform:'darwin',env:{RADIOCLI_ALARM_TERMINAL:'darwin:apple-terminal'},spawn})).rejects.toThrow(/permission.*automatic ringing controls/i);await expect(prepareAlarmTerminalAccess({platform:'win32',spawn})).resolves.toBeUndefined();expect(spawn).toHaveBeenCalledOnce();});

  it('rejects setup verification when no graphical terminal can expose ringing controls',async()=>{await expect(verifyAlarmTerminalLaunch({platform:'freebsd',env:{},timeoutMs:10})).rejects.toThrow(/no supported graphical terminal/i);});

  it('requires the launched terminal process to complete an authenticated callback',async()=>{const launch=vi.fn((_command:string,args:readonly string[])=>{const invocation=powershellInvocation(args);expect(invocation.command).toBe(process.execPath);expect(args).not.toContain('-NoExit');return nodeSpawn(invocation.command,invocation.args,{stdio:'ignore'});});await expect(verifyAlarmTerminalLaunch({platform:'win32',env:{WT_SESSION:'test'},nodePath:process.execPath,spawn:launch,resolve:command=>command,timeoutMs:2_000})).resolves.toBe('win32:windows-terminal');expect(launch).toHaveBeenCalledOnce();});

  it('bounds and closes a callback connection that never sends its token', async () => {
    let socket: Socket | undefined;
    const launch = vi.fn((_command: string, args: readonly string[]) => {
      const child = new EventEmitter() as ChildProcess;
      child.unref = vi.fn();
      const probeArgs = bootstrapPayload(powershellInvocation(args).args).args;
      const port = Number(probeArgs.at(-3));
      const host = probeArgs.at(-1)!;
      socket = connect(port, host);
      socket.on('error', () => undefined);
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    try {
      await expect(verifyAlarmTerminalLaunch({platform: 'win32', env: {WT_SESSION: 'test'}, spawn: launch, resolve: command => command, timeoutMs: 30})).rejects.toThrow(/did not connect back/i);
    } finally { socket?.destroy(); }
  });
});
