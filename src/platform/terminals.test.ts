import {execFileSync,spawn,type ChildProcess} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {basename,join,posix} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTerminalLaunch,detectGraphicalTerminal,launchTerminalCommand,waitForLaunch} from './terminals.js';

const roots:string[]=[];
afterEach(()=>{vi.useRealTimers();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const resolve=(command:string)=>command;
function fixture(){const root=mkdtempSync(join(process.cwd(),'.radiocli-terminals-'));roots.push(root);return root;}
function terminalPath(root:string,name:string){return posix.join(basename(root),name);}
function nodeInvocation(args: readonly string[], environment: NodeJS.ProcessEnv = {}): {command: string; args: string[]} {
  const index = args.indexOf('-EncodedCommand');
  expect(index).toBeGreaterThanOrEqual(0);
  const script = Buffer.from(args[index + 1]!, 'base64').toString('utf16le');
  const encoded = /FromBase64String\('([^']+)'\)/.exec(script)?.[1];
  const key = /GetEnvironmentVariable\('([^']+)'/.exec(script)?.[1];
  const source = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : environment[key!];
  expect(source).toBeDefined();
  const invocation = JSON.parse(source!) as {command: string; args: string[]};
  return invocation.args.includes('-EncodedCommand') ? nodeInvocation(invocation.args) : invocation;
}

describe('shared graphical terminal discovery',()=>{
  it('ignores a malformed saved descriptor and continues normal terminal detection',()=>{expect(detectGraphicalTerminal('linux',{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linuxX'},command=>command==='kitty'?'/usr/bin/kitty':undefined)).toBe('linux:/usr/bin/kitty');});
  it.each(['linux','freebsd','openbsd','netbsd'] as const)('requires the central Unix adapter policy and an installed terminal on %s',platform=>{const env={DISPLAY:':0',TERMINAL:'xterm'};expect(detectGraphicalTerminal(platform,env,command=>command==='xterm'?'/usr/local/bin/xterm':undefined)).toBe(`${platform}:/usr/local/bin/xterm`);expect(detectGraphicalTerminal(platform,env,()=>undefined)).toBe(`${platform}:unsupported`);expect(detectGraphicalTerminal(platform,{...env,DISPLAY:''},resolve)).toBe(`${platform}:unsupported`);});
  it.each(['freebsd','openbsd','netbsd'] as const)('accepts a legacy Linux descriptor after revalidating the saved Unix terminal on %s',platform=>{expect(detectGraphicalTerminal(platform,{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/local/bin/xterm'},resolve)).toBe('linux:/usr/local/bin/xterm');expect(detectGraphicalTerminal(platform,{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/local/bin/xterm'},()=>undefined)).toBe(`${platform}:unsupported`);});
  it('requires an X11 or Wayland session before selecting a Unix terminal',()=>{expect(detectGraphicalTerminal('linux',{RADIOCLI_ALARM_TERMINAL:'linux:/bin/kitty'},resolve)).toBe('linux:unsupported');});
  it('revalidates saved executable paths and refuses stale files and directories',()=>{const root=fixture();const kitty=join(root,'kitty');mkdirSync(kitty);const env={DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:`linux:${terminalPath(root,'kitty')}`};expect(detectGraphicalTerminal('linux',env)).toBe('linux:unsupported');rmSync(kitty,{recursive:true});expect(detectGraphicalTerminal('linux',env)).toBe('linux:unsupported');});
  it.skipIf(process.platform==='win32')('refuses a saved Unix terminal without executable permission',()=>{const root=fixture();writeFileSync(join(root,'kitty'),'stub',{mode:0o600});expect(detectGraphicalTerminal('linux',{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:`linux:${terminalPath(root,'kitty')}`})).toBe('linux:unsupported');});
  it('resolves installed terminals from the supplied PATH',()=>{const root=fixture();writeFileSync(join(root,'kitty'),'stub',{mode:0o700});expect(detectGraphicalTerminal('linux',{DISPLAY:':0',PATH:basename(root),TERMINAL:'kitty'})).toBe(`linux:${terminalPath(root,'kitty')}`);});
  it('does not select an X11-only terminal for a Wayland-only session',()=>{expect(detectGraphicalTerminal('linux',{WAYLAND_DISPLAY:'wayland-0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/xterm'},resolve)).toBe('linux:unsupported');});
  it('does not select a Wayland-only terminal for an X11-only session',()=>{expect(detectGraphicalTerminal('linux',{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/foot'},resolve)).toBe('linux:unsupported');});
  it('does not accept a saved Linux descriptor on unsupported runtimes',()=>{expect(detectGraphicalTerminal('linux',{TERMUX_VERSION:'0.118.3',DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/kitty'},resolve)).toBe('termux:unsupported');expect(detectGraphicalTerminal('haiku',{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/kitty'},resolve)).toBe('haiku:unsupported');});
});

describe('graphical terminal invocation plans',()=>{
  it.each([
    ['gnome-terminal',['--']],['mate-terminal',['-x']],['xfce4-terminal',['-x']],['terminator',['-x']],
    ['wezterm',['start','--always-new-process','--']],['kitty',['-e']],['alacritty',['-e']],['konsole',['-e']],['ghostty',['-e']],['tilix',['-e']],['x-terminal-emulator',['-e']],['xterm',['-e']],['uxterm',['-e']],['foot',['--']]
  ] as const)('uses %s argument boundaries without joining application argv', (name,prefix)=>{const nodePath='/Node A/单播/node';const args=['/Radio A/cli.js','agent-ui','a;& quoted "value"'];const plan=createTerminalLaunch({platform:'linux',env:{DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0',RADIOCLI_ALARM_TERMINAL:`linux:/tools/${name}`},nodePath,args,resolve});expect(plan).toMatchObject({command:`/tools/${name}`,args:[...prefix,nodePath,...args]});});
  it.skipIf(process.platform==='win32')('uses a literal-safe shell boundary for qterminal command parsing',()=>{const plan=createTerminalLaunch({platform:'linux',env:{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/tools/qterminal'},nodePath:process.execPath,args:['-e','process.stdout.write(process.argv[1])','--',"Data ' \" ; $() 单播"],resolve});expect(plan.args.slice(0,3)).toEqual(['-e','/bin/sh','-c']);expect(execFileSync('/bin/sh',plan.args.slice(2),{encoding:'utf8'})).toBe("Data ' \" ; $() 单播");});
  it('preserves a special data home and every argument through the Windows Node bootstrap',()=>{
    const home='C:\\Data %PATH%! & "quote" \' 单播';const values=['space value','%PATH%!','a&b','"quoted"',"'quoted'",'单播',''];
    const plan=createTerminalLaunch({platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:'win32:console',RADIOCLI_HOME:home},nodePath:process.execPath,args:['-e',"process.stdout.write(JSON.stringify({args:process.argv.slice(1),home:process.env.RADIOCLI_HOME}))",'--',...values],resolve,closeOnExit:true});
    const payload=nodeInvocation(plan.args,plan.environment);
    expect(payload.args[1]).not.toContain('"');const output=execFileSync(payload.command,payload.args,{encoding:'utf8'});expect(JSON.parse(output)).toEqual({args:values,home});expect(plan.command).toBe('powershell.exe');
  });
  it('requests a separate Windows console without inheriting detached launcher stdio',()=>{
    const plan=createTerminalLaunch({platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:'win32:console'},nodePath:'/node',args:['/cli.js'],resolve,closeOnExit:true});
    const script=Buffer.from(plan.args.at(-1)!,'base64').toString('utf16le');
    expect(script).toContain('Start-Process');expect(script).toContain('-WindowStyle Normal');expect(script).not.toMatch(/-NoNewWindow|-RedirectStandard/);
    expect(script).toMatch(/SetEnvironmentVariable\('[^']+',\$null,'Process'\);Start-Process/);
  });
  it('keeps a console launch with ordinary deep install paths below the Windows command-line limit',()=>{
    const nodePath=`C:\\Program Files\\${'Runtime\\'.repeat(19)}node.exe`;
    const cliPath=`C:\\${'RadioCLI\\'.repeat(22)}dist\\cli.js`;
    const dataRoot=`C:\\${'Radio Data\\'.repeat(18)}`;
    const env={RADIOCLI_ALARM_TERMINAL:'win32:console',RADIOCLI_HOME:`${dataRoot}Home`,RADIOCLI_MPV_PATH:`${dataRoot}mpv.exe`,RADIOCLI_FFPLAY_PATH:`${dataRoot}ffplay.exe`,RADIOCLI_VLC_PATH:`${dataRoot}vlc.exe`,RADIOCLI_FFMPEG_PATH:`${dataRoot}ffmpeg.exe`};
    const plan=createTerminalLaunch({platform:'win32',env,nodePath,args:[cliPath],resolve});
    expect([nodePath,cliPath,...Object.values(env)].every(value=>value.length<260)).toBe(true);
    // Include quotes, separators, and NUL in the CreateProcessW limit.
    expect([plan.command,...plan.args].reduce((length,value)=>length+value.length+3,1)).toBeLessThan(32_767);
    const handoff=Object.values(plan.environment!);expect(handoff).toHaveLength(1);
    expect(handoff[0]!.length+1).toBeLessThan(32_767);
    const inner=JSON.parse(handoff[0]!) as {command:string;args:string[]};
    expect([inner.command,...inner.args].reduce((length,value)=>length+value.length+3,1)).toBeLessThan(32_767);
  });
  it.skipIf(process.platform!=='win32')('opens real Windows console TTY handles and preserves literal argv and environment',async()=>{
    const root=fixture();const cli=join(root,"Radio %PATH%! & ' 单播.cjs");const output=join(root,'console-result.json');
    // File output observes the actual TTY child without redirecting its stdio.
    writeFileSync(cli,"const fs=require('node:fs');const output=process.argv[2];fs.writeFileSync(output+'.tmp',JSON.stringify({stdin:process.stdin.isTTY===true,stdout:process.stdout.isTTY===true,stderr:process.stderr.isTTY===true,args:process.argv.slice(3),home:process.env.RADIOCLI_HOME,mpv:process.env.RADIOCLI_MPV_PATH}),'utf8');fs.renameSync(output+'.tmp',output)");
    const home='C:\\Data %PATH%! & "quote" \' 单播';const mpv="C:\\Players %PATH%! & ' 单播\\mpv.exe";const args=['spaces here','%PATH%!','a&b','"quoted"',"'quoted'",'单播',''];
    const diagnostic:{commandCharacters:number;spawned:boolean;code:number|null;signal:NodeJS.Signals|null;error?:string;stdout:string;stderr:string}={commandCharacters:0,spawned:false,code:null,signal:null,stdout:'',stderr:''};
    await launchTerminalCommand({platform:'win32',env:{...process.env,RADIOCLI_ALARM_TERMINAL:'win32:console',RADIOCLI_HOME:home,RADIOCLI_MPV_PATH:mpv},nodePath:process.execPath,args:[cli,output,...args],closeOnExit:true,spawn:(command,args,options)=>{
      diagnostic.commandCharacters=[command,...args].reduce((length,value)=>length+value.length+3,1);
      // Capture only the outer launcher; Start-Process still creates the child
      // with its own unredirected console handles. Never log inherited env.
      const child=spawn(command,args,{...options,stdio:['ignore','pipe','pipe']});
      child.stdout?.on('data',chunk=>diagnostic.stdout=(diagnostic.stdout+String(chunk)).slice(-4_000));
      child.stderr?.on('data',chunk=>diagnostic.stderr=(diagnostic.stderr+String(chunk)).slice(-4_000));
      child.once('spawn',()=>diagnostic.spawned=true);
      child.once('error',error=>diagnostic.error=error.message);
      child.once('close',(code,signal)=>{diagnostic.code=code;diagnostic.signal=signal;});
      return child;
    }}).catch(error=>{throw new Error(`Windows console launcher failed: ${JSON.stringify(diagnostic)}`,{cause:error});});
    const deadline=Date.now()+10_000;
    while(!existsSync(output)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    expect(existsSync(output),`Windows console probe did not finish: ${JSON.stringify(diagnostic)}`).toBe(true);
    expect(JSON.parse(readFileSync(output,'utf8'))).toEqual({stdin:true,stdout:true,stderr:true,args,home,mpv});
  },15_000);
  it.each([{platform:'linux' as const,terminal:'linux:/tools/kitty'},{platform:'darwin' as const,terminal:'darwin:wezterm'}])('preserves configured players and network policy through an existing $terminal server',({platform,terminal})=>{
    const configured={RADIOCLI_MPV_PATH:"/Players % ! & ' 单播/mpv",RADIOCLI_FFPLAY_PATH:'/Players A/ffplay',RADIOCLI_VLC_PATH:'/Players A/vlc',RADIOCLI_FFMPEG_PATH:'/Players A/ffmpeg',RADIOCLI_OFFLINE:'0',RADIOCLI_LOW_BANDWIDTH:'true'};
    const script=`process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(configured))}.map(key=>[key,process.env[key]]))))`;
    const plan=createTerminalLaunch({platform,env:{...configured,DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:terminal,HTTPS_PROXY:'https://private-password@proxy.invalid'},nodePath:process.execPath,args:['-e',script],resolve});
    const args=plan.args.slice(plan.args.indexOf(process.execPath)+1);
    const output=execFileSync(process.execPath,args,{encoding:'utf8',env:{...process.env,...Object.fromEntries(Object.keys(configured).map(key=>[key,'stale-server-value']))}});
    expect(JSON.parse(output)).toEqual(configured);
    expect(JSON.parse(Buffer.from(args.at(-1)!,'base64url').toString('utf8')).environment).toEqual(configured);
  });
  it.skipIf(process.platform==='win32')('passes configured player paths literally through Apple Terminal shell commands',()=>{
    const mpv="/Players $ % ! & ' 单播/mpv";
    const plan=createTerminalLaunch({platform:'darwin',env:{RADIOCLI_MPV_PATH:mpv},nodePath:process.execPath,args:['-e','process.stdout.write(process.env.RADIOCLI_MPV_PATH)'],resolve});
    expect(execFileSync('/bin/sh',['-c',plan.args.at(-1)!],{encoding:'utf8',env:{...process.env,RADIOCLI_MPV_PATH:'stale'}})).toBe(mpv);
  });
  it.each(['darwin','linux','win32'] as const)('rejects control characters in approved %s terminal environment values',platform=>{expect(()=>createTerminalLaunch({platform,env:{DISPLAY:':0',RADIOCLI_MPV_PATH:'/tools/mpv\nInjected=value'},nodePath:'/node',args:['/cli.js'],resolve})).toThrow(/RADIOCLI_MPV_PATH.*control/i);});
  it('uses the same data-home bootstrap without assuming /usr/bin/env exists',()=>{const home="/Data A/O'Brien 单播";const plan=createTerminalLaunch({platform:'linux',env:{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/tools/kitty',RADIOCLI_HOME:home},nodePath:process.execPath,args:['-e','process.stdout.write(process.env.RADIOCLI_HOME)'],resolve});expect(plan.args).not.toContain('/usr/bin/env');expect(execFileSync(process.execPath,plan.args.slice(2),{encoding:'utf8'})).toBe(home);});
  it('fails before spawning when Windows has no runnable PowerShell',()=>{expect(()=>createTerminalLaunch({platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:'win32:console'},nodePath:'/node',args:['/cli.js'],resolve:()=>undefined})).toThrow(/PowerShell.*unavailable/i);});
});

describe('terminal launcher acceptance',()=>{
  it('rejects a launcher that exits unsuccessfully immediately after spawn',async()=>{const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();const result=waitForLaunch(child);child.emit('spawn');child.emit('close',1);await expect(result).rejects.toThrow(/launcher.*exit.*1/i);});
  it('accepts a live launcher without claiming application readiness',async()=>{vi.useFakeTimers();const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();const result=waitForLaunch(child);child.emit('spawn');await vi.advanceTimersByTimeAsync(100);await expect(result).resolves.toBeUndefined();expect(child.unref).toHaveBeenCalledOnce();});
  it('bounds a launcher that never reports process startup',async()=>{vi.useFakeTimers();const child=new EventEmitter() as ChildProcess;const result=expect(waitForLaunch(child)).rejects.toThrow(/did not report process startup/i);await vi.advanceTimersByTimeAsync(3_000);await result;});
});
