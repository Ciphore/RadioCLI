import {execFileSync,type ChildProcess} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {basename,join,posix} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTerminalLaunch,detectGraphicalTerminal,waitForLaunch} from './terminals.js';

const roots:string[]=[];
afterEach(()=>{vi.useRealTimers();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const resolve=(command:string)=>command;
function fixture(){const root=mkdtempSync(join(process.cwd(),'.radiocli-terminals-'));roots.push(root);return root;}
function terminalPath(root:string,name:string){return posix.join(basename(root),name);}

describe('shared graphical terminal discovery',()=>{
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
    const script=Buffer.from(plan.args.at(-1)!,'base64').toString('utf16le');const payload=JSON.parse(Buffer.from(/FromBase64String\('([^']+)'\)/.exec(script)![1]!,'base64').toString('utf8')) as {command:string;args:string[]};
    expect(payload.args[1]).not.toContain('"');const output=execFileSync(payload.command,payload.args,{encoding:'utf8'});expect(JSON.parse(output)).toEqual({args:values,home});expect(plan.command).toBe('powershell.exe');
  });
  it.skipIf(process.platform!=='win32')('round-trips literal CLI paths and argv through native Windows PowerShell',()=>{
    const root=fixture();const cli=join(root,"Radio %PATH%! & ' 单播.cjs");
    // ASCII output separates exact argv transport from console code pages.
    writeFileSync(cli,"process.stdout.write(Buffer.from(JSON.stringify({args:process.argv.slice(2),home:process.env.RADIOCLI_HOME}),'utf8').toString('base64'))");
    const home='C:\\Data %PATH%! & "quote" \' 单播';const args=['spaces here','%PATH%!','a&b','"quoted"',"'quoted'",'单播',''];
    const plan=createTerminalLaunch({platform:'win32',env:{...process.env,RADIOCLI_ALARM_TERMINAL:'win32:console',RADIOCLI_HOME:home},nodePath:process.execPath,args:[cli,...args],closeOnExit:true});
    const output=execFileSync(plan.command,plan.args,{encoding:'utf8',windowsHide:true,timeout:10_000});
    expect(JSON.parse(Buffer.from(output,'base64').toString('utf8'))).toEqual({args,home});
  });
  it('uses the same data-home bootstrap without assuming /usr/bin/env exists',()=>{const home="/Data A/O'Brien 单播";const plan=createTerminalLaunch({platform:'linux',env:{DISPLAY:':0',RADIOCLI_ALARM_TERMINAL:'linux:/tools/kitty',RADIOCLI_HOME:home},nodePath:process.execPath,args:['-e','process.stdout.write(process.env.RADIOCLI_HOME)'],resolve});expect(plan.args).not.toContain('/usr/bin/env');expect(execFileSync(process.execPath,plan.args.slice(2),{encoding:'utf8'})).toBe(home);});
  it('fails before spawning when Windows has no runnable PowerShell',()=>{expect(()=>createTerminalLaunch({platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:'win32:console'},nodePath:'/node',args:['/cli.js'],resolve:()=>undefined})).toThrow(/PowerShell.*unavailable/i);});
});

describe('terminal launcher acceptance',()=>{
  it('rejects a launcher that exits unsuccessfully immediately after spawn',async()=>{const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();const result=waitForLaunch(child);child.emit('spawn');child.emit('close',1);await expect(result).rejects.toThrow(/launcher.*exit.*1/i);});
  it('accepts a live launcher without claiming application readiness',async()=>{vi.useFakeTimers();const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();const result=waitForLaunch(child);child.emit('spawn');await vi.advanceTimersByTimeAsync(100);await expect(result).resolves.toBeUndefined();expect(child.unref).toHaveBeenCalledOnce();});
  it('bounds a launcher that never reports process startup',async()=>{vi.useFakeTimers();const child=new EventEmitter() as ChildProcess;const result=expect(waitForLaunch(child)).rejects.toThrow(/did not report process startup/i);await vi.advanceTimersByTimeAsync(3_000);await result;});
});
