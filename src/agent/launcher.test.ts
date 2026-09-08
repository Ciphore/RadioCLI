import {EventEmitter} from 'node:events';
import {spawn as nodeSpawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {launchRadioTui,resolveExecutable} from './launcher.js';

vi.mock('node:child_process',async importOriginal=>({...await importOriginal<typeof import('node:child_process')>(),spawn:vi.fn()}));
const roots:string[]=[];
const calls:Array<{command:string;args:readonly string[]}>=[];
const spawn=vi.fn((command:string,args:readonly string[])=>{calls.push({command,args});const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();child.kill=vi.fn();queueMicrotask(()=>{child.emit('spawn');child.emit('close',0);});return child;});
beforeEach(()=>{calls.length=0;spawn.mockClear();vi.mocked(nodeSpawn).mockImplementation(spawn as unknown as typeof nodeSpawn);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),'radiocli-launcher-'));roots.push(root);return root;}

describe('agent graphical launcher',()=>{
  it('does not resolve a directory as a command',()=>{const root=fixture();const path=join(root,'radiocli-test-command');mkdirSync(path);expect(resolveExecutable(path,{PATH:root},'linux')).toBeUndefined();});
  it.skipIf(process.platform==='win32')('requires executable permission for Unix commands',()=>{const root=fixture();const path=join(root,'radiocli-test-command');writeFileSync(path,'test',{mode:0o600});expect(resolveExecutable(path,{PATH:root},'linux')).toBeUndefined();});
  it('preserves the existing executable lookup API for runnable files',()=>{const root=fixture();const path=join(root,`radiocli-test-command${process.platform==='win32'?'.exe':''}`);writeFileSync(path,'test',{mode:0o700});expect(resolveExecutable('radiocli-test-command',{PATH:root},process.platform)).toBe(path);});

  it.each(['win32:console','win32:windows-terminal'])('encodes hostile paths and the data home without cmd interpolation in %s',async terminal=>{
    const home='C:\\Data %PATH%! & "quoted" \' 单播';const nodePath='C:\\Node %TEMP%! & 单播\\node.exe';const cliPath='C:\\Radio %PATH%! & 单播\\cli.js';
    await launchRadioTui(nodePath,cliPath,'encoded-agent-command',{platform:'win32',env:{RADIOCLI_ALARM_TERMINAL:terminal,RADIOCLI_HOME:home},spawn,resolve:command=>command});
    const call=calls[0]!;expect(call.command).not.toBe('cmd.exe');const encoded=call.args[call.args.indexOf('-EncodedCommand')+1];expect(call.args).toContain('-EncodedCommand');
    const script=Buffer.from(encoded!,'base64').toString('utf16le');const match=/FromBase64String\('([^']+)'\)/.exec(script);expect(match).not.toBeNull();
    const invocation=JSON.parse(Buffer.from(match![1]!,'base64').toString('utf8')) as {command:string;args:string[]};expect(invocation.command).toBe(nodePath);
    const payload=JSON.parse(Buffer.from(invocation.args.at(-1)!,'base64url').toString('utf8'));
    expect(payload).toEqual({args:[cliPath,'agent-ui','encoded-agent-command'],environment:{RADIOCLI_HOME:home}});expect(script).not.toContain(home);expect(script).not.toContain(cliPath);
  });

  it('surfaces an immediate native launcher failure after spawn',async()=>{
    const launch=vi.fn(()=>{const child=new EventEmitter() as ChildProcess;child.unref=vi.fn();queueMicrotask(()=>{child.emit('spawn');child.emit('close',1);});return child;});vi.mocked(nodeSpawn).mockImplementation(launch as typeof nodeSpawn);
    await expect(launchRadioTui('/node','/cli.js','encoded',{platform:'darwin',env:{RADIOCLI_ALARM_TERMINAL:'darwin:apple-terminal'},spawn:launch,resolve:command=>command})).rejects.toThrow(/terminal.*exit|launcher.*exit/i);
  });

  it('does not launch a graphical terminal in a headless Unix session',async()=>{await expect(launchRadioTui('/node','/cli.js','encoded',{platform:'linux',env:{RADIOCLI_ALARM_TERMINAL:'linux:/usr/bin/kitty'},spawn,resolve:command=>command})).rejects.toThrow(/graphical|display|headless/i);expect(spawn).not.toHaveBeenCalled();});
  it.each(['freebsd','openbsd','netbsd'] as const)('requests the same agent session command in a supported %s desktop',async platform=>{await launchRadioTui('/node','/cli.js','encoded',{platform,env:{DISPLAY:':0',TERMINAL:'xterm'},spawn,resolve:command=>command==='xterm'?'/usr/local/bin/xterm':undefined});expect(calls[0]).toEqual({command:'/usr/local/bin/xterm',args:['-e','/node','/cli.js','agent-ui','encoded']});});
});
