import {spawn} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {powershellCommand} from './shell.js';
import {resolveCommandDetails} from './executables.js';

describe('PowerShell command transport',()=>{
  it('transports paths, arguments, and environment as data rather than executable source',()=>{
    const values=['C:\\Tools %PATH%! & \' 单播\\scoop.cmd','install','mpv','text "quoted" ; $(throw boom)'];const environment={RADIOCLI_HOME:'C:\\Data %PATH%! & "quoted" \' 单播'};
    const args=powershellCommand(values,environment);expect(args.slice(0,-1)).toEqual(['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand']);
    const script=Buffer.from(args.at(-1)!,'base64').toString('utf16le');const encoded=/FromBase64String\('([^']+)'\)/.exec(script)?.[1];expect(encoded).toBeDefined();
    expect(JSON.parse(Buffer.from(encoded!,'base64').toString('utf8'))).toEqual({command:values[0],args:values.slice(1),environment});
    expect(script).not.toContain(values[0]);expect(script).not.toContain(values.at(-1));expect(script).not.toContain(environment.RADIOCLI_HOME);expect(script).toContain('exit $LASTEXITCODE');
  });

  it('can leave an interactive console open after the child command',()=>{const args=powershellCommand(['node','cli.js'],{}, {keepOpen:true});expect(args).toContain('-NoExit');expect(args).not.toContain('-NonInteractive');expect(Buffer.from(args.at(-1)!,'base64').toString('utf16le')).not.toContain('exit $LASTEXITCODE');});
  it('rejects empty commands and NUL bytes before starting a process',()=>{expect(()=>powershellCommand([])).toThrow(/command/i);expect(()=>powershellCommand(['node','bad\0value'])).toThrow(/NUL/i);});

  it.skipIf(process.platform!=='win32')('preserves special data-home characters under native Windows PowerShell',async()=>{
    const powershell=resolveCommandDetails('powershell.exe').path;expect(powershell).not.toBeNull();const home='C:\\Data %PATH%! & "quoted" \' 单播';
    const args=powershellCommand([process.execPath,'-e',"process.stdout.write(process.env.RADIOCLI_HOME)"],{RADIOCLI_HOME:home});
    const result=await new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(powershell!,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=String(chunk));child.stderr.on('data',chunk=>stderr+=String(chunk));child.once('error',reject);child.once('close',code=>resolve({code:code??1,stdout,stderr}));});
    expect(result).toEqual({code:0,stdout:home,stderr:''});
  });
});
