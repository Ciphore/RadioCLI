import {spawn} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {powershellCommand} from './shell.js';
import {resolveCommandDetails} from './executables.js';
import {nodeLaunchCommand} from './launch-command.js';

describe('PowerShell command transport',()=>{
  it('transports paths, arguments, and environment as data rather than executable source',()=>{
    const values=['C:\\Tools %PATH%! & \' 单播\\scoop.cmd','install','mpv','text "quoted" ; $(throw boom)'];const environment={RADIOCLI_HOME:'C:\\Data %PATH%! & "quoted" \' 单播'};
    const args=powershellCommand(values,environment);expect(args.slice(0,-1)).toEqual(['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand']);
    const script=Buffer.from(args.at(-1)!,'base64').toString('utf16le');const encoded=/FromBase64String\('([^']+)'\)/.exec(script)?.[1];expect(encoded).toBeDefined();
    expect(JSON.parse(Buffer.from(encoded!,'base64').toString('utf8'))).toEqual({command:values[0],args:values.slice(1),environment});
    expect(script).not.toContain(values[0]);expect(script).not.toContain(values.at(-1));expect(script).not.toContain(environment.RADIOCLI_HOME);expect(script).toContain('exit $LASTEXITCODE');
  });

  it('can leave an interactive console open after the child command',()=>{const args=powershellCommand(['node','cli.js'],{}, {keepOpen:true});expect(args).toContain('-NoExit');expect(args).not.toContain('-NonInteractive');expect(Buffer.from(args.at(-1)!,'base64').toString('utf16le')).not.toContain('exit $LASTEXITCODE');});
  it('silences first-use module progress before invoking cmdlets while retaining errors',()=>{
    const script=Buffer.from(powershellCommand(['node','cli.js']).at(-1)!,'base64').toString('utf16le');
    expect(script).toMatch(/^\$ErrorActionPreference='Stop';\$ProgressPreference='SilentlyContinue';/);
  });
  it('rejects empty commands and NUL bytes before starting a process',()=>{expect(()=>powershellCommand([])).toThrow(/command/i);expect(()=>powershellCommand(['node','bad\0value'])).toThrow(/NUL/i);});

  it.skipIf(process.platform!=='win32')('preserves special data-home characters under native Windows PowerShell',async()=>{
    const powershell=resolveCommandDetails('powershell.exe').path;expect(powershell).not.toBeNull();const home='C:\\Data %PATH%! & "quoted" \' 单播';
    // Keep captured output ASCII so this checks environment transport without
    // depending on the Windows console's separate legacy code-page behavior.
    const args=powershellCommand([process.execPath,'-e',"process.stdout.write(Buffer.from(process.env.RADIOCLI_HOME,'utf8').toString('base64'))"],{RADIOCLI_HOME:home});
    const result=await new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(powershell!,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=String(chunk));child.stderr.on('data',chunk=>stderr+=String(chunk));child.once('error',reject);child.once('close',code=>resolve({code:code??1,stdout,stderr}));});
    expect(result.code).toBe(0);expect(result.stderr).toBe('');expect(Buffer.from(result.stdout,'base64').toString('utf8')).toBe(home);
  });

  it.skipIf(process.platform!=='win32')('runs the complete Node bootstrap with literal argv and environment through native Windows PowerShell',async()=>{
    const powershell=resolveCommandDetails('powershell.exe').path;expect(powershell).not.toBeNull();
    const home='C:\\Data %PATH%! & "quoted" \' 单播';const mpv="C:\\Players %PATH%! & ' 单播\\mpv.exe";
    const values=['space value','%PATH%!','a&b','"quoted"',"'quoted'",'$(throw boom);','单播',''];
    const script="process.stdout.write(Buffer.from(JSON.stringify({args:process.argv.slice(1),home:process.env.RADIOCLI_HOME,mpv:process.env.RADIOCLI_MPV_PATH}),'utf8').toString('base64'))";
    const bootstrap=nodeLaunchCommand(process.execPath,['-e',script,'--',...values],{RADIOCLI_HOME:home,RADIOCLI_MPV_PATH:mpv});
    const args=powershellCommand(bootstrap);
    const result=await new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(powershell!,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=String(chunk));child.stderr.on('data',chunk=>stderr+=String(chunk));child.once('error',reject);child.once('close',code=>resolve({code:code??1,stdout,stderr}));});
    expect(result.code,JSON.stringify(result)).toBe(0);expect(result.stderr).toBe('');
    expect(JSON.parse(Buffer.from(result.stdout,'base64').toString('utf8'))).toEqual({args:values,home,mpv});
  });
});
