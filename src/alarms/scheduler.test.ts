import {describe, expect, it, vi} from 'vitest';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,posix,win32} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import type {Alarm} from '../types.js';
import {createSchedulerAdapter, SchedulerService,shouldRunLaunchdOccurrence,type SchedulerAdapter} from './scheduler.js';
import {pathEnvironmentKeys, platformPaths} from '../platform/paths.js';

const alarm: Alarm = {
  id: 'wake<&"', label: 'Morning <&>', enabled: true,
  station: {id: 'x', provider: 'radio-browser', name: 'X', tags: []},
  schedule: {type: 'once', at: '2030-02-03T14:05:00.000Z'},
  playback: {volume: 30, fadeSeconds: 0, stopAfterMinutes: 30},
  reliability: {missedRunGraceMinutes: 10, wakeIfSupported: true},
  createdAt: '2029-01-01T00:00:00.000Z', updatedAt: '2029-01-01T00:00:00.000Z'
};

function windowsTaskInvocation(body: string): {command: string; args: string[]} {
  expect(body).toContain('<Command>%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>');
  const argumentsText = /<Arguments>([^<]+)<\/Arguments>/.exec(body)?.[1];
  expect(argumentsText).toBeDefined();
  const args = argumentsText!.split(' ');
  const script = Buffer.from(args[args.indexOf('-EncodedCommand') + 1]!, 'base64').toString('utf16le');
  const encoded = /FromBase64String\('([^']+)'\)/.exec(script)?.[1];
  expect(encoded).toBeDefined();
  return JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8'));
}

const decodeXml = (value: string) => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');
function schedulerInvocation(body: string, platform: 'darwin' | 'linux' | 'win32'): {command: string; args: string[]} {
  if (platform === 'win32') return windowsTaskInvocation(body);
  const values: string[] = platform === 'darwin'
    ? [.../<key>ProgramArguments<\/key><array>([\s\S]*?)<\/array>/.exec(body)![1]!.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(match => decodeXml(match[1]!))
    : [.../^ExecStart=:(.+)$/m.exec(body)![1]!.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => (JSON.parse(match[0]) as string).replaceAll('%%', '%'));
  return {command: values[0]!, args: values.slice(1)};
}
function schedulerPayload(body: string, platform: 'darwin' | 'linux' | 'win32'): {args: string[]; environment: Record<string, string>} {
  return JSON.parse(Buffer.from(schedulerInvocation(body, platform).args.at(-1)!, 'base64url').toString('utf8'));
}

function schedulerEnvironment(body: string, platform: 'darwin' | 'linux' | 'win32'): Record<string, string> {
  if (platform === 'win32') return {};
  if (platform === 'darwin') {
    const environment = /<key>EnvironmentVariables<\/key><dict>([\s\S]*?)<\/dict>/.exec(body)![1]!;
    return Object.fromEntries([...environment.matchAll(/<key>([^<]+)<\/key><string>([^<]*)<\/string>/g)].map(match => [decodeXml(match[1]!), decodeXml(match[2]!)]));
  }
  return Object.fromEntries([...body.matchAll(/^Environment=(.+)$/gm)].map(match => {
    const entry = (JSON.parse(match[1]!) as string).replaceAll('%%', '%');
    return [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)];
  }));
}

const windowsTaskPath = (id: string) => `\\RadioCLI\\io.radiocli.alarm.${createHash('sha256').update(id).digest('hex').slice(0, 20)}`;
function windowsLookupResult(overrides: Record<string, unknown> = {}) {
  return {code: 0, stdout: JSON.stringify({taskPath: windowsTaskPath(alarm.id), stage: 'lookup', status: 'error', hresult: -2147024894, message: 'El sistema no puede encontrar el archivo especificado.', ...overrides}), stderr: ''};
}

describe('native alarm schedulers', () => {
  it('generates safely escaped launchd artifacts and an argv-only command', async () => {
    const write = vi.fn(); const run = vi.fn(async () => ({code: 0, stdout: '', stderr: ''}));
    const adapter = createSchedulerAdapter({platform: 'darwin', home: '/Users/A B', nodePath: '/Node A/node', cliPath: '/App A/dist/cli.js', writeFile: write, removeFile: vi.fn(), run, env: {RADIOCLI_HOME: '/Data & A'}});
    await adapter.install(alarm, new Date('2030-02-03T14:05:00.000Z'));
    expect(write).toHaveBeenCalledOnce();
    const xml = String(write.mock.calls[0]?.[1]);
    expect(xml).not.toContain(alarm.label);
    expect(xml).toContain('<string>/Node A/node</string>');
    expect(xml).not.toContain('<key>Year</key>');
    expect(xml).not.toContain('<key>Second</key>');
    expect(schedulerPayload(xml, 'darwin').args).toEqual(['/App A/dist/cli.js', 'alarm', 'internal-launchd', alarm.id, '2030-02-03T14:05:00.000Z']);
    expect(xml).toContain('<key>RADIOCLI_HOME</key><string>/Data &amp; A</string>');
    expect(xml).toContain('<key>RADIOCLI_ALARM_TERMINAL</key><string>darwin:apple-terminal</string>');
    expect((run.mock.calls as unknown as Array<[string,string[]]>).every(call => Array.isArray(call[1]))).toBe(true);
  });

  it('makes an early annual launchd calendar match a true no-op',()=>{expect(shouldRunLaunchdOccurrence('2035-02-03T14:05:00Z',new Date('2030-02-03T14:05:00Z'))).toBe(false);expect(shouldRunLaunchdOccurrence('2035-02-03T14:05:00Z',new Date('2035-02-03T14:05:00Z'))).toBe(true);});
  it('installs the next launchd occurrence without booting out the current runner',async()=>{const writes:Array<[string,string]>=[];const run=vi.fn(async(_command:string,args:string[])=>({code:args[0]==='print'?1:0,stdout:'',stderr:''}));const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:(path,body)=>writes.push([path,body]),removeFile:vi.fn(),run,env:{}});const recurring:Alarm={...alarm,schedule:{type:'recurring',time:'14:05',weekdays:[1,2,3,4,5,6,7],timezone:'UTC'}};const service=new SchedulerService(adapter,()=>new Date('2030-02-03T14:06:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[])} as never);await expect(service.syncClaimed(recurring,new Date('2030-02-03T14:05:00Z'))).resolves.toEqual(new Date('2030-02-04T14:05:00Z'));expect(run.mock.calls.map(call=>call[1]?.[0])).not.toContain('bootout');expect(run).toHaveBeenCalledWith('launchctl',expect.arrayContaining(['bootstrap']));expect(writes[0]?.[0]).toMatch(/io\.radiocli\.alarm\.[a-f0-9]+\.[a-f0-9]+\.plist$/);expect(schedulerPayload(writes[0]![1],'darwin').args).toContain('2030-02-04T14:05:00.000Z');});

  it.each([['nonzero',false],['rejected',true]] as const)('retains a stable launchd artifact when bootout is %s and the job is still loaded',async(_label,rejected)=>{const remove=vi.fn();const run=vi.fn(async(_command:string,args:string[])=>{if(args[0]==='bootout'){if(rejected)throw new Error('transport');return{code:5,stdout:'',stderr:'busy'};}return{code:0,stdout:'loaded',stderr:''};});const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:vi.fn(),removeFile:remove,run,env:{}});await expect(adapter.completeOccurrence!(alarm.id,new Date(alarm.schedule.type==='once'?alarm.schedule.at:''))).rejects.toThrow(/still loaded/i);expect(remove).not.toHaveBeenCalled();});

  it('tolerates a failed launchd bootout only when print reports the exact service not found',async()=>{const remove=vi.fn();const run=vi.fn(async(_command:string,args:string[])=>{if(args[0]==='bootout')return{code:5,stdout:'',stderr:'busy'};const label=args[1]!.split('/').at(-1)!;return{code:113,stdout:'',stderr:`Bad request. Could not find service "${label}" in domain for user gui: 501`};});const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:vi.fn(),removeFile:remove,run,env:{}});await expect(adapter.completeOccurrence!(alarm.id,new Date('2030-02-03T14:05:00Z'))).resolves.toBeUndefined();expect(remove).toHaveBeenCalledOnce();});

  it.each([{name:'missing launchctl executable',result:{code:127,stdout:'',stderr:'spawn launchctl ENOENT'}},{name:'permission failure',result:{code:1,stdout:'',stderr:'Operation not permitted'}},{name:'arbitrary nonzero',result:{code:9,stdout:'',stderr:'I/O error'}},{name:'different missing service',result:{code:113,stdout:'',stderr:'Could not find service "other.label" in domain for user gui: 501'}}])('retains the launchd plist when absence verification reports $name',async({result})=>{const remove=vi.fn();const run=vi.fn(async(_command:string,args:string[])=>args[0]==='bootout'?{code:5,stdout:'',stderr:'busy'}:result);const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:vi.fn(),removeFile:remove,run,env:{}});await expect(adapter.completeOccurrence!(alarm.id,new Date('2030-02-03T14:05:00Z'))).rejects.toThrow(/verify.*absence/i);expect(remove).not.toHaveBeenCalled();});

  it('removes a stable launchd artifact after successful bootout without an absence probe',async()=>{const remove=vi.fn();const run=vi.fn(async()=>({code:0,stdout:'',stderr:''}));const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:vi.fn(),removeFile:remove,run,env:{}});await adapter.completeOccurrence!(alarm.id,new Date('2030-02-03T14:05:00Z'));expect(remove).toHaveBeenCalledOnce();expect(run).toHaveBeenCalledOnce();});

  it('retains an occurrence-specific plist when its loaded launchd job rejects unload',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-launchd-complete-'));try{let completing=false;const run=vi.fn(async(_command:string,args:string[])=>{if(!completing)return{code:args[0]==='print'?1:0,stdout:'',stderr:''};return{code:args[0]==='bootout'?9:0,stdout:'',stderr:'busy'};});const adapter=createSchedulerAdapter({platform:'darwin',home:root,nodePath:'/node',cliPath:'/cli.js',writeFile:(path,body)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body);},removeFile:path=>rmSync(path,{force:true}),run,env:{}});const occurrence=new Date('2030-02-04T14:05:00Z');await adapter.installFromRunner!(alarm,occurrence,new Date('2030-02-03T14:05:00Z'));const directory=join(root,'Library','LaunchAgents');const artifact=join(directory,readdirSync(directory)[0]!);completing=true;await expect(adapter.completeOccurrence!(alarm.id,occurrence)).rejects.toThrow(/still loaded/i);expect(existsSync(artifact)).toBe(true);expect(artifact).toMatch(/\.[a-f0-9]{12}\.plist$/);}finally{rmSync(root,{recursive:true,force:true});}});
  it('keeps launchd XML comments valid when a user label contains double hyphens',async()=>{const write=vi.fn();const adapter=createSchedulerAdapter({platform:'darwin',home:'/Users/a',nodePath:'/node',cliPath:'/cli.js',writeFile:write,removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''})),env:{}});await adapter.install({...alarm,label:'wake -- now'},new Date('2030-02-03T14:05:00Z'));const artifact=String(write.mock.calls[0]?.[1]);const comments=[...artifact.matchAll(/<!--([\s\S]*?)-->/g)].map(match=>match[1]);expect(comments.every(comment=>!comment?.includes('--'))).toBe(true);expect(artifact).not.toContain('wake -- now');});
  it('rejects a machine-local timestamp at the launchd gate',()=>{expect(()=>shouldRunLaunchdOccurrence('2035-02-03T14:05:00',new Date())).toThrow(/absolute/i);});

  it('generates persistent systemd user units', async () => {
    const writes: Array<[string,string]> = [];
    const adapter = createSchedulerAdapter({platform: 'linux', home: '/home/a b', nodePath: '/usr/bin/node', cliPath: '/opt/radio cli/dist/cli.js', writeFile: (p,c) => writes.push([p,c]), removeFile: vi.fn(), run: vi.fn(async () => ({code: 0, stdout: '', stderr: ''})), commandExists: () => true, env: {}});
    await adapter.install(alarm, new Date('2030-02-03T14:05:00.000Z'));
    expect(writes.map(item => item[1]).join('\n')).toContain('Persistent=true');
    expect(writes.map(item => item[1]).join('\n')).toContain('AccuracySec=1s');
    expect(schedulerPayload(writes.find(([path]) => path.endsWith('.service'))![1], 'linux').args).toEqual(['/opt/radio cli/dist/cli.js', 'alarm', 'internal-run', alarm.id, '2030-02-03T14:05:00.000Z']);
    expect(writes.map(item => item[1]).join('\n')).toContain('RADIOCLI_ALARM_TERMINAL=linux:unsupported');
  });

  it('exposes truthful unsupported Linux capability', () => {
    const adapter = createSchedulerAdapter({platform: 'linux', home: '/h', nodePath: 'node', cliPath: 'cli.js', writeFile: vi.fn(), removeFile: vi.fn(), run: vi.fn(), commandExists: () => false, env: {}});
    expect(adapter.capabilities().supported).toBe(false);
    expect(adapter.capabilities().message).toMatch(/systemd/i);
  });

  it('retains scheduler health and repair artifacts when systemctl is unavailable',async()=>{
    const run=vi.fn();const removeFile=vi.fn();const health={record:vi.fn(),list:()=>[],get:()=>[],remove:vi.fn()};
    const adapter=createSchedulerAdapter({platform:'linux',home:'/missing-radiocli-home',env:{},commandExists:()=>false,run,removeFile,writeFile:vi.fn()});
    const service=new SchedulerService(adapter,()=>new Date(),health as never);
    await expect(service.remove(alarm.id)).rejects.toThrow(/systemctl.*unavailable|verify.*remov|verify.*absence/i);
    expect(health.remove).not.toHaveBeenCalled();expect(removeFile).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
    expect(health.record).toHaveBeenCalledWith(expect.objectContaining({alarmId:alarm.id,component:'scheduler',healthy:false,message:expect.stringContaining('retained')}));
  });

  it('allows removal of a definition on a runtime with no native scheduler adapter',async()=>{
    const run=vi.fn();const adapter=createSchedulerAdapter({platform:'freebsd',env:{},run});
    const health={record:vi.fn(),list:()=>[],get:()=>[],remove:vi.fn()};
    await expect(new SchedulerService(adapter,()=>new Date(),health as never).remove(alarm.id)).resolves.toBeUndefined();
    expect(health.remove).toHaveBeenCalledWith(alarm.id);expect(run).not.toHaveBeenCalled();
  });

  it('creates a current-user Windows task with wake and local interactive audio semantics', async () => {
    const write=vi.fn();const run=vi.fn(async()=>({code:0,stdout:'',stderr:''}));
    const adapter=createSchedulerAdapter({platform:'win32',home:'C:\\Users\\A B',nodePath:'C:\\Node A\\node.exe',cliPath:'C:\\Radio A\\dist\\cli.js',writeFile:write,removeFile:vi.fn(),run,env:{LOCALAPPDATA:'C:\\Data A',RADIOCLI_HOME:'C:\\Profile & A'}});
    await adapter.install(alarm,new Date('2030-02-03T14:05:00.000Z'));
    const artifact=String((write.mock.calls as unknown as Array<[string,string]>)[0]?.[1]);
    expect(artifact).toContain('<LogonType>InteractiveToken</LogonType>');
    expect(artifact).toContain('<WakeToRun>true</WakeToRun>');
    expect(artifact).toContain('StartWhenAvailable');
    expect(artifact).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
    expect(artifact).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>');
    expect(artifact).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>');
    expect(artifact).toContain('encoding="UTF-8"');
    const invocation=windowsTaskInvocation(artifact);
    expect(invocation.command).toBe('C:\\Node A\\node.exe');
    expect(JSON.parse(Buffer.from(invocation.args.at(-1)!,'base64url').toString('utf8')).environment).toEqual({LOCALAPPDATA:'C:\\Data A',RADIOCLI_HOME:'C:\\Profile & A',RADIOCLI_ALARM_TERMINAL:'win32:console'});
    expect(artifact).not.toContain('&amp;amp;');
    expect(adapter.capabilities().exactWake).toBe(false);
    expect((run.mock.calls as unknown as Array<[string,string[]]>)[0]?.[1]).toContain('/XML');
  });

  it('preserves literal Windows job arguments and approved environment values',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-windows-job-'));
    try{
      const cliPath=join(root,"Radio $ %PATH%! & ' 单播.cjs");const writes:Array<[string,string]>=[];
      const configured={RADIOCLI_HOME:"C:\\Data %PATH%! & ' 单播",RADIOCLI_MPV_PATH:"C:\\Players %PATH%! & ' 单播\\mpv.exe",RADIOCLI_FFPLAY_PATH:'C:\\Players A\\ffplay.exe',RADIOCLI_VLC_PATH:'C:\\Players A\\vlc.exe',RADIOCLI_FFMPEG_PATH:'C:\\Players A\\ffmpeg.exe',RADIOCLI_OFFLINE:'0',RADIOCLI_LOW_BANDWIDTH:'1'};
      writeFileSync(cliPath,`process.stdout.write(JSON.stringify({args:process.argv.slice(2),environment:Object.fromEntries(${JSON.stringify(Object.keys(configured))}.map(key=>[key,process.env[key]]))}))`);
      const adapter=createSchedulerAdapter({platform:'win32',home:root,nodePath:process.execPath,cliPath,env:{...configured,HTTPS_PROXY:'https://private-password@proxy.invalid'},writeFile:(path,body)=>writes.push([path,body]),removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''}))});
      await adapter.install(alarm,new Date('2030-02-03T14:05:00Z'));
      const {command,args}=windowsTaskInvocation(writes[0]![1]);expect(command).toBe(process.execPath);expect(args).toHaveLength(3);expect(args[0]).toBe('-e');
      const payload=JSON.parse(Buffer.from(args.at(-1)!,'base64url').toString('utf8'));expect(payload.environment).toEqual({...configured,RADIOCLI_ALARM_TERMINAL:'win32:console'});expect(JSON.stringify(payload)).not.toContain('private-password');
      const output=execFileSync(command,args,{encoding:'utf8',windowsHide:true});
      expect(JSON.parse(output)).toEqual({args:['alarm','internal-run',alarm.id,'2030-02-03T14:05:00.000Z'],environment:configured});
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('pins systemd timers in UTC and escapes specifiers',async()=>{
    const writes:Array<[string,string]>=[];const adapter=createSchedulerAdapter({platform:'linux',home:'/home/a',nodePath:'/node%p',cliPath:'/app%h/cli.js',writeFile:(p,c)=>writes.push([p,c]),removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''})),commandExists:()=>true,env:{RADIOCLI_HOME:'/data%u'}});
    await adapter.install(alarm,new Date('2030-02-03T14:05:00Z'));const units=writes.map(item=>item[1]).join('\n');expect(units).toContain('2030-02-03 14:05:00 UTC');expect(units).toContain('/node%%p');expect(units).toContain('RADIOCLI_HOME=/data%%u');
  });

  it('disables systemd command expansion while preserving literal environment values',async()=>{
    const writes:Array<[string,string]>=[];
    const adapter=createSchedulerAdapter({platform:'linux',home:'/home/a',nodePath:'/Node $ ${CUSTOM} % 单播/node',cliPath:'/app-${CUSTOM}/% spaced 单播/cli.js',env:{RADIOCLI_HOME:'/data $ ${CUSTOM} % 单播'},commandExists:()=>true,writeFile:(path,body)=>writes.push([path,body]),removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''}))});
    await adapter.install(alarm,new Date('2030-02-03T14:05:00Z'));
    const service=writes.find(([path])=>path.endsWith('.service'))![1];
    expect(service).toContain('ExecStart=:"/Node $ ${CUSTOM} %% 单播/node" "-e"');
    expect(schedulerPayload(service, 'linux').args[0]).toBe('/app-${CUSTOM}/% spaced 单播/cli.js');
    expect(service).toContain('Environment="RADIOCLI_HOME=/data $ ${CUSTOM} %% 单播"');
    expect(service).not.toContain('$$');
  });

  it.each(['darwin','linux'] as const)('preserves explicit player locations and network policy without proxy secrets in %s jobs',async platform=>{
    const writes:Array<[string,string]>=[];
    const configured={RADIOCLI_MPV_PATH:'/Players A/mpv',RADIOCLI_FFPLAY_PATH:'/Players A/ffplay',RADIOCLI_VLC_PATH:'/Players A/vlc',RADIOCLI_FFMPEG_PATH:'/Players A/ffmpeg',RADIOCLI_OFFLINE:'0',RADIOCLI_LOW_BANDWIDTH:'1'};
    const adapter=createSchedulerAdapter({platform,home:'/home/a',nodePath:'/node',cliPath:'/cli.js',env:{...configured,HTTPS_PROXY:'https://proxy-user:private-password@proxy.invalid',ARBITRARY_SECRET:'private-secret'},commandExists:()=>true,writeFile:(path,body)=>writes.push([path,body]),removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''}))});
    await adapter.install(alarm,new Date('2030-02-03T14:05:00Z'));
    const artifact=writes.map(([,body])=>body).join('\n');
    for(const [key,value] of Object.entries(configured))expect(artifact).toContain(platform==='darwin'?`<key>${key}</key><string>${value}</string>`:`Environment="${key}=${value}"`);
    expect(artifact).not.toMatch(/proxy-user|private-password|private-secret|HTTPS_PROXY|ARBITRARY_SECRET/);
  });

  it.each(['darwin', 'linux', 'win32'] as const)('runs the generated %s scheduler command with its saved identity in clean and contaminated environments', async platform => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-scheduler-identity-'));
    try {
      const cliPath = join(root, "inspect $ % & ' 単播.cjs");
      writeFileSync(cliPath, `process.stdout.write(JSON.stringify({args:process.argv.slice(2),env:Object.fromEntries(${JSON.stringify(pathEnvironmentKeys)}.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))}))`);
      const path = platform === 'win32' ? win32 : posix;
      const dataRoot = platform === 'win32' ? 'C:\\Users\\scheduler-fixture' : root;
      const configured = {HOME: dataRoot, USERPROFILE: path.join(dataRoot, 'profile'), APPDATA: '', LOCALAPPDATA: path.join(dataRoot, 'local'), RADIO_ATLAS_HOME: path.join(dataRoot, "alias $ % & ' 単播"), XDG_DATA_HOME: path.join(dataRoot, 'data'), XDG_CACHE_HOME: path.join(dataRoot, 'cache'), XDG_RUNTIME_DIR: path.join(dataRoot, 'runtime')};
      const writes: Array<[string, string]> = [];
      const adapter = createSchedulerAdapter({platform, home: root, nodePath: process.execPath, cliPath, env: {...configured, HTTPS_PROXY: 'private-proxy-secret'}, commandExists: () => true, writeFile: (path, body) => writes.push([path, body]), removeFile: vi.fn(), run: vi.fn(async () => ({code: 0, stdout: '', stderr: ''}))});
      await adapter.install(alarm, new Date('2030-02-03T14:05:00Z'));
      const artifact = writes.find(([path]) => platform !== 'linux' || path.endsWith('.service'))![1];
      const invocation = schedulerInvocation(artifact, platform);
      const clean = {...process.env};
      for (const key of pathEnvironmentKeys) delete clean[key];
      const contaminated = {...clean, ...Object.fromEntries(pathEnvironmentKeys.map(key => [key, `${root}/stale-${key}`]))};
      for (const env of [clean, contaminated]) {
        const observed = JSON.parse(execFileSync(invocation.command, invocation.args, {env: {...env, ...schedulerEnvironment(artifact, platform)}, encoding: 'utf8', windowsHide: true}));
        expect(observed.args).toEqual(['alarm', platform === 'darwin' ? 'internal-launchd' : 'internal-run', alarm.id, '2030-02-03T14:05:00.000Z']);
        // An empty APPDATA root denotes the invoking directory. The snapshot
        // retains that location even if the native manager has another cwd.
        expect(observed.env).toEqual({...configured, APPDATA: path.resolve(process.cwd())});
        expect(platformPaths({platform, home: root, env: observed.env})).toEqual(platformPaths({platform, home: root, env: configured}));
      }
      expect(artifact).not.toContain('private-proxy-secret');
    } finally {rmSync(root, {recursive: true, force: true});}
  });

  it.each(['darwin','linux','win32'] as const)('rejects control characters in an approved %s job environment before writing artifacts',async platform=>{
    const writeFile=vi.fn();const adapter=createSchedulerAdapter({platform,home:'/home/a',nodePath:'/node',cliPath:'/cli.js',env:{RADIOCLI_MPV_PATH:'/tools/mpv\nInjected=value'},commandExists:()=>true,writeFile,removeFile:vi.fn(),run:vi.fn(async()=>({code:0,stdout:'',stderr:''}))});
    await expect(adapter.install(alarm,new Date('2030-02-03T14:05:00Z'))).rejects.toThrow(/RADIOCLI_MPV_PATH.*control/i);expect(writeFile).not.toHaveBeenCalled();
  });

  it('removes disabled alarms and reschedules enabled alarms', async () => {
    const adapter = {capabilities: vi.fn(() => ({supported: true, exactWake: false, catchUpAfterWake: true, message: 'ok'})), install: vi.fn(), remove: vi.fn(), status: vi.fn()};
    const service = new SchedulerService(adapter, () => new Date('2029-01-01T00:00:00Z'), {record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[])} as never);
    await service.sync({...alarm, enabled: false});
    expect(adapter.remove).toHaveBeenCalledWith(alarm.id);
    await service.sync(alarm);
    expect(adapter.install).toHaveBeenCalled();
    await service.statusAll([alarm]);
    expect(adapter.status).toHaveBeenCalledWith(alarm.id);
  });

  it('attempts Guard cleanup even when native removal fails', async () => {
    const adapter: SchedulerAdapter = {capabilities: () => ({supported: true, exactWake: false, catchUpAfterWake: true, message: 'ok'}), install: vi.fn(), remove: vi.fn(async () => { throw new Error('native stuck'); }), status: vi.fn()};
    const guard = {start: vi.fn(), stop: vi.fn(async () => true)};
    const health = {record: vi.fn(entry => entry), list: vi.fn(() => []), get: vi.fn(() => [])};
    const service = new SchedulerService(adapter, () => new Date('2029-01-01T00:00:00Z'), health as never, guard);
    await expect(service.sync({...alarm, enabled: false})).rejects.toThrow('native stuck');
    expect(guard.stop).toHaveBeenCalledWith(alarm.id);
    expect(health.record).toHaveBeenCalledWith(expect.objectContaining({component: 'scheduler', healthy: false}));
  });

  it('keeps a registered job healthy while surfacing requested Guard startup failure',async()=>{const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),status:vi.fn(async()=>({installed:true,healthy:true,message:'ok'}))};const records:Array<{component:string;healthy:boolean}>=[];const health={record:vi.fn(entry=>{records.push(entry);return entry;}),list:vi.fn(()=>[]),get:vi.fn(()=>[])};const guard={start:vi.fn(async()=>{throw new Error('guard failed');}),stop:vi.fn(async()=>true)};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),health as never,guard);await expect(service.sync({...alarm,reliability:{...alarm.reliability,keepAwakeUntilAlarm:true}})).rejects.toThrow(/guard failed/i);expect(adapter.install).toHaveBeenCalled();expect(records).toContainEqual(expect.objectContaining({component:'scheduler',healthy:true}));expect(records).toContainEqual(expect.objectContaining({component:'power',healthy:false}));});
  it('treats no native registration as healthy for disabled alarms',async()=>{const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:vi.fn(),remove:vi.fn(),status:vi.fn()};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[])} as never);const [status]=await service.statusAll([{...alarm,enabled:false}]);expect(status?.native).toMatchObject({installed:false,healthy:true});expect(adapter.status).not.toHaveBeenCalled();});
  it('bounds bulk scheduler operations to four concurrent jobs',async()=>{let active=0;let maximum=0;const operation=vi.fn(async()=>{active+=1;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,2));active-=1;});const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:operation,remove:operation,status:vi.fn(async()=>{await operation();return{installed:true,healthy:true,message:'ok'};})};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[])} as never);const alarms=Array.from({length:20},(_,index)=>({...alarm,id:`a-${index}`}));await service.syncAll(alarms);expect(maximum).toBeLessThanOrEqual(4);active=0;maximum=0;await service.statusAll(alarms);expect(maximum).toBeLessThanOrEqual(4);});
  it('fails disable/removal when an active Guard cannot be verified stopped',async()=>{const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:vi.fn(),remove:vi.fn(),status:vi.fn()};const record=vi.fn();const guard={start:vi.fn(),stop:vi.fn(async()=>false),status:vi.fn(async()=>({guards:[{alarmId:alarm.id}]}))};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record,list:vi.fn(()=>[]),get:vi.fn(()=>[]),remove:vi.fn()} as never,guard);await expect(service.sync({...alarm,enabled:false})).rejects.toThrow(/teardown|verified/i);expect(record).toHaveBeenCalledWith(expect.objectContaining({component:'power',healthy:false}));await expect(service.remove(alarm.id)).rejects.toThrow(/retained/i);expect(adapter.remove).toHaveBeenCalledTimes(1);});
  it('accepts false Guard stop only when status verifies no matching Guard exists',async()=>{const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:vi.fn(),remove:vi.fn(),status:vi.fn()};const guard={start:vi.fn(),stop:vi.fn(async()=>false),status:vi.fn(async()=>({guards:[]}))};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[]),remove:vi.fn()} as never,guard);await expect(service.sync({...alarm,enabled:false})).resolves.toBeNull();await expect(service.remove(alarm.id)).resolves.toBeUndefined();});
  it('accepts a successful authenticated Guard teardown',async()=>{const adapter:SchedulerAdapter={capabilities:()=>({supported:true,exactWake:false,catchUpAfterWake:true,message:'ok'}),install:vi.fn(),remove:vi.fn(),status:vi.fn()};const guard={start:vi.fn(),stop:vi.fn(async()=>true),status:vi.fn()};const service=new SchedulerService(adapter,()=>new Date('2029-01-01T00:00:00Z'),{record:vi.fn(),list:vi.fn(()=>[]),get:vi.fn(()=>[]),remove:vi.fn()} as never,guard);await expect(service.sync({...alarm,enabled:false})).resolves.toBeNull();expect(guard.status).not.toHaveBeenCalled();});

  it.each(['darwin', 'linux', 'win32'] as const)('retains %s repair artifacts when native removal fails and absence is uncertain', async platform => {
    const removeFile = vi.fn();
    const run = vi.fn(async () => ({code: 1, stdout: '', stderr: 'Permission denied'}));
    const adapter = createSchedulerAdapter({platform, home: '/missing-radiocli-test-home', env: {}, commandExists: () => true, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).rejects.toThrow(/remov|absen|disable|bootout|delete/i);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'linux', 'win32'] as const)('retains %s repair artifacts when the targeted native job is still registered', async platform => {
    const removeFile = vi.fn();
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === 'print' || args[0] === '/Query') return {code: 0, stdout: 'registered', stderr: ''};
      if (args.includes('show')) return {code: 0, stdout: 'LoadState=loaded\nActiveState=active\n', stderr: ''};
      return {code: 1, stdout: '', stderr: 'busy'};
    });
    const adapter = createSchedulerAdapter({platform, home: '/missing-radiocli-test-home', env: {}, commandExists: () => true, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).rejects.toThrow();
    expect(removeFile).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'linux', 'win32'] as const)('accepts failed %s removal only after a targeted absence response', async platform => {
    const removeFile = vi.fn();
    const run = vi.fn(async (command: string, args: string[]) => {
      if (args[0] === 'print') return {code: 113, stdout: '', stderr: `Could not find service "${args[1]!.split('/').at(-1)}" in domain for user gui: 501`};
      if (args.includes('show')) return {code: 1, stdout: 'LoadState=not-found\nActiveState=inactive\n', stderr: ''};
      if (command === 'powershell.exe') return windowsLookupResult();
      if (args.includes('daemon-reload')) return {code: 0, stdout: '', stderr: ''};
      return {code: 1, stdout: '', stderr: 'already gone'};
    });
    const adapter = createSchedulerAdapter({platform, home: '/missing-radiocli-test-home', env: {}, commandExists: () => true, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).resolves.toBeUndefined();
    expect(removeFile).toHaveBeenCalled();
  });

  it('reports an unreachable systemd user manager without writing native jobs', async () => {
    const writeFile = vi.fn();
    const run = vi.fn(async (_command: string, _args: string[]) => ({code: 1, stdout: '', stderr: 'Failed to connect to user bus'}));
    const adapter = createSchedulerAdapter({platform: 'linux', env: {}, commandExists: () => true, writeFile, removeFile: vi.fn(), run});
    const service = new SchedulerService(adapter, () => new Date(), {record: vi.fn(), list: () => [], get: () => []} as never);
    expect(adapter.capabilities().message).toMatch(/detect|verif|check/i);
    const report = await service.runtimeStatus();
    expect(report.capabilities).toMatchObject({supported: false, catchUpAfterWake: false});
    expect(report.capabilities.message).toMatch(/user.*manager|user bus/i);
    await expect(adapter.install(alarm, new Date(alarm.schedule.type === 'once' ? alarm.schedule.at : ''))).rejects.toThrow(/user.*manager|user bus/i);
    expect(writeFile).not.toHaveBeenCalled();
    expect(run.mock.calls.every(call => call[1].includes('show'))).toBe(true);
  });

  it('bounds a stalled systemd user-manager probe', async () => {
    vi.useFakeTimers();
    try {
      const adapter = createSchedulerAdapter({platform: 'linux', env: {}, commandExists: () => true, writeFile: vi.fn(), removeFile: vi.fn(), run: () => new Promise(() => {})});
      const service = new SchedulerService(adapter, () => new Date(), {record: vi.fn(), list: () => [], get: () => []} as never);
      const pending = service.runtimeStatus();
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await pending).capabilities).toMatchObject({supported: false});
    } finally { vi.useRealTimers(); }
  });

  it('uses the injected executable environment for scheduler discovery', () => {
    // A relative PATH entry also represents a POSIX search path when this
    // injected Linux case runs on Windows, whose drive prefix contains ':'.
    const root = mkdtempSync(join(process.cwd(), '.radiocli-scheduler-path-'));
    vi.stubEnv('PATH', '/missing-radiocli-executables');
    try {
      writeFileSync(join(root, 'systemctl'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
      const adapter = createSchedulerAdapter({platform: 'linux', env: {PATH: basename(root)}, home: root, writeFile: vi.fn(), removeFile: vi.fn(), run: vi.fn()});
      expect(adapter.capabilities().supported).toBe(true);
    } finally { vi.unstubAllEnvs(); rmSync(root, {recursive: true, force: true}); }
  });

  it('does not select Linux scheduling for a Termux environment', async () => {
    const writeFile = vi.fn(); const run = vi.fn();
    const adapter = createSchedulerAdapter({platform: 'linux', env: {TERMUX_VERSION: 'test'}, commandExists: () => true, writeFile, removeFile: vi.fn(), run});
    expect(adapter.capabilities()).toMatchObject({supported: false, catchUpAfterWake: false});
    await expect(adapter.install(alarm, new Date('2030-02-03T14:05:00Z'))).rejects.toThrow(/termux/i);
    expect(writeFile).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it('retains an alarm when Guard ownership remains unresolved', async () => {
    const adapter: SchedulerAdapter = {capabilities: () => ({supported: true, exactWake: false, catchUpAfterWake: true, message: 'ok'}), install: vi.fn(), remove: vi.fn(), status: vi.fn()};
    const guard = {start: vi.fn(), stop: vi.fn(async () => false), status: vi.fn(async () => ({guards: [], unresolvedGuards: [{alarmId: alarm.id}]}))};
    const service = new SchedulerService(adapter, () => new Date(), {record: vi.fn(), list: () => [], get: () => [], remove: vi.fn()} as never, guard);
    await expect(service.remove(alarm.id)).rejects.toThrow(/verified|retained/i);
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it('does not accept an absence response for another launchd service sharing the target prefix',async()=>{const removeFile=vi.fn();const run=vi.fn(async(_command:string,args:string[])=>({code:113,stdout:'',stderr:args[0]==='print'?`Could not find service "${args[1]!.split('/').at(-1)}.other" in domain for user gui: 501`:'busy'}));const adapter=createSchedulerAdapter({platform:'darwin',home:'/missing-radiocli-test-home',env:{},writeFile:vi.fn(),removeFile,run});await expect(adapter.remove(alarm.id)).rejects.toThrow(/verify.*absence/i);expect(removeFile).not.toHaveBeenCalled();});

  it('keeps a registered but inactive systemd timer unhealthy without mutating its registration',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-systemd-inactive-'));try{
      const cliPath=join(root,'cli.js');writeFileSync(cliPath,'');const run=vi.fn(async(_command:string,args:string[])=>({code:args.includes('is-active')?3:0,stdout:args.includes('is-active')?'inactive':'',stderr:''}));
      const writeFile=vi.fn((path:string,body:string)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body);});
      const adapter=createSchedulerAdapter({platform:'linux',home:root,nodePath:process.execPath,cliPath,env:{},commandExists:()=>true,writeFile,run});
      await adapter.install(alarm,new Date('2030-02-03T14:05:00Z'));writeFile.mockClear();run.mockClear();
      expect(await adapter.status(alarm.id)).toMatchObject({installed:true,healthy:false,message:expect.stringMatching(/not active/i)});expect(writeFile).not.toHaveBeenCalled();expect(run.mock.calls.map(call=>call[1][1])).toEqual(['show','is-enabled','is-active']);
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it.each(['darwin','linux','win32'] as const)('retains %s repair artifacts when native commands reject instead of returning status',async platform=>{const removeFile=vi.fn();const adapter=createSchedulerAdapter({platform,env:{},home:'/missing-radiocli-test-home',writeFile:vi.fn(),removeFile,commandExists:()=>true,run:async()=>{throw new Error('native transport failed');}});await expect(adapter.remove(alarm.id)).rejects.toThrow(/verify.*removal/i);expect(removeFile).not.toHaveBeenCalled();});

  it.each([
    {hresult: -2147024894, message: 'El sistema no puede encontrar el archivo especificado.'},
    {hresult: -2147024894, message: 'Das System kann die angegebene Datei nicht finden.'},
    {hresult: -2147024893, message: '指定されたパスが見つかりません。'}
  ])('removes Windows repair metadata after localized absence HRESULT $hresult: $message', async result => {
    const removeFile = vi.fn();
    const run = vi.fn(async (command: string) => command === 'powershell.exe' ? windowsLookupResult(result) : {code: 1, stdout: '', stderr: result.message});
    const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).resolves.toBeUndefined();
    expect(removeFile).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    {label: 'access denied', hresult: -2147024891, message: 'Zugriff verweigert.'},
    {label: 'unknown failure', hresult: -2147467259, message: 'Erreur non spécifiée.'},
    {label: 'missing COM service', hresult: -2147024894, message: 'Servicio no encontrado.', stage: 'connect'},
    {label: 'inaccessible root folder', hresult: -2147024893, message: 'Chemin introuvable.', stage: 'root'}
  ])('retains Windows repair metadata and diagnostics for $label', async ({label: _label, ...result}) => {
    const removeFile = vi.fn();
    const run = vi.fn(async (command: string) => command === 'powershell.exe' ? windowsLookupResult(result) : {code: 1, stdout: '', stderr: 'delete failed'});
    const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
    const failure = await adapter.remove(alarm.id).catch(error => error as Error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(result.message);
    expect((failure as Error).message).toContain('delete failed');
    expect((failure as Error).message).toContain(`0x${(result.hresult >>> 0).toString(16)}`);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it.each([
    {label: 'empty response', result: {code: 0, stdout: '', stderr: ''}},
    {label: 'plain localized text', result: {code: 1, stdout: '', stderr: 'El sistema no puede encontrar el archivo especificado.'}},
    {label: 'malformed JSON', result: {code: 0, stdout: '{broken', stderr: ''}},
    {label: 'null response', result: {code: 0, stdout: 'null', stderr: ''}},
    {label: 'array response', result: {code: 0, stdout: '[]', stderr: ''}},
    {label: 'string HRESULT', result: windowsLookupResult({hresult: '-2147024894'})},
    {label: 'unsupported status', result: windowsLookupResult({status: 'absent'})},
    {label: 'missing diagnostic', result: windowsLookupResult({message: null})},
    {label: 'unrelated task', result: windowsLookupResult({taskPath: `${windowsTaskPath(alarm.id)}.other`})},
    {label: 'failed process with valid JSON', result: {...windowsLookupResult(), code: 1}},
    {label: 'extra output', result: {...windowsLookupResult(), stdout: `notice\n${windowsLookupResult().stdout}`}}
  ])('does not infer Windows task absence from $label', async ({result}) => {
    const removeFile = vi.fn();
    const run = vi.fn(async (command: string) => command === 'powershell.exe' ? result : {code: 0, stdout: '', stderr: ''});
    const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).rejects.toThrow(/verify.*absence|verify.*removal/i);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('retains Windows repair metadata when successful deletion is followed by a still-present task', async () => {
    const removeFile = vi.fn();
    const run = vi.fn(async (command: string) => command === 'powershell.exe' ? windowsLookupResult({status: 'present', hresult: 0, message: ''}) : {code: 0, stdout: '', stderr: ''});
    const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
    await expect(adapter.remove(alarm.id)).rejects.toThrow(/still registered/i);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('waits for native Windows absence verification before removing the artifact', async () => {
    const removeFile = vi.fn();
    let finishLookup!: (result: ReturnType<typeof windowsLookupResult>) => void;
    const lookup = new Promise<ReturnType<typeof windowsLookupResult>>(resolve => {finishLookup = resolve;});
    const run = vi.fn(async (command: string) => command === 'powershell.exe' ? lookup : {code: 0, stdout: '', stderr: ''});
    const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
    const pending = adapter.remove(alarm.id);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(removeFile).not.toHaveBeenCalled();
    finishLookup(windowsLookupResult());
    await expect(pending).resolves.toBeUndefined();
    expect(removeFile).toHaveBeenCalledOnce();
  });

  it('limits Windows deletion and lookup to the exact named task and retains unrelated artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-windows-remove-'));
    try {
      const id = "../other; $env:HOME & ' 単播";
      const target = windowsTaskPath(id);
      const run = vi.fn(async (command: string) => command === 'powershell.exe' ? windowsLookupResult({taskPath: target}) : {code: 0, stdout: '', stderr: ''});
      const adapter = createSchedulerAdapter({platform: 'win32', home: root, env: {LOCALAPPDATA: root}, run});
      await adapter.install({...alarm, id}, new Date('2030-02-03T14:05:00Z'));
      await adapter.install(alarm, new Date('2030-02-03T14:05:00Z'));
      run.mockClear();
      await adapter.remove(id);
      const calls = run.mock.calls as unknown as Array<[string, string[]]>;
      expect(calls[0]).toEqual(['schtasks.exe', ['/Delete', '/TN', target, '/F']]);
      expect(calls[1]![0]).toBe('powershell.exe');
      const args = calls[1]![1];
      expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
      const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le');
      expect(script).not.toContain(id);
      expect(script).not.toMatch(/DeleteFolder|DeleteTask|GetTasks|Unregister-ScheduledTask/i);
      const encodedPath = /FromBase64String\('([^']+)'\)/.exec(script)?.[1];
      expect(Buffer.from(encodedPath!, 'base64').toString('utf8')).toBe(target);
      expect(readdirSync(join(root, 'RadioCLI', 'scheduler'))).toEqual([`${windowsTaskPath(alarm.id).split('\\').at(-1)}.xml`]);
    } finally {rmSync(root, {recursive: true, force: true});}
  });

  it('bounds a stalled Windows deletion and absence probe without removing repair artifacts', async () => {
    vi.useFakeTimers();
    try {
      const removeFile = vi.fn();
      const run = vi.fn(() => new Promise<ReturnType<typeof windowsLookupResult>>(() => {}));
      const adapter = createSchedulerAdapter({platform: 'win32', env: {}, writeFile: vi.fn(), removeFile, run});
      const pending = adapter.remove(alarm.id);
      const assertion = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
      expect(run).toHaveBeenCalledTimes(2);
      expect(removeFile).not.toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });

  it.each(['freebsd','openbsd','netbsd','android','haiku','sunos','aix'] as const)('does not create or claim native alarm registration on %s',async platform=>{const writeFile=vi.fn();const run=vi.fn();const commandExists=vi.fn(()=>true);const adapter=createSchedulerAdapter({platform,env:{},writeFile,run,commandExists});expect(adapter.capabilities()).toMatchObject({supported:false,exactWake:false,catchUpAfterWake:false});await expect(adapter.install(alarm,new Date('2030-02-03T14:05:00Z'))).rejects.toThrow(/not supported/i);expect(writeFile).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();expect(commandExists).not.toHaveBeenCalled();});
});
