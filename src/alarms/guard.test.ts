import {mkdirSync,mkdtempSync,readFileSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {Server} from 'node:net';
import {describe,expect,it,vi} from 'vitest';
import type {Alarm} from '../types.js';
import {AlarmGuardService,runAlarmGuard,terminateGuardTree} from './guard.js';
import {AlarmPowerGuardStore} from './power-guard-store.js';

describe('one-shot alarm guard',()=>{
  it('acquires until the concrete occurrence then always releases',async()=>{
    const release=vi.fn(async()=>{});const inhibitor={status:vi.fn(()=>({supported:true,active:false,message:'ok'})),acquire:vi.fn(async()=>({release}))};
    const store={get:vi.fn(()=>({alarmId:'a',occurrenceAt:'2030-01-01T00:01:00.000Z',status:'active'})),markActive:vi.fn(),markReleased:vi.fn(),markFailed:vi.fn()};let current=new Date('2030-01-01T00:00:00Z');
    await runAlarmGuard('a','2030-01-01T00:01:00Z',inhibitor,store as never,()=>current,vi.fn(async()=>{current=new Date('2030-01-01T00:02:00Z');}));
    expect(store.markActive).toHaveBeenCalledWith('a',expect.any(Date),'2030-01-01T00:01:00.000Z');expect(store.markReleased).toHaveBeenCalledWith('a',expect.any(Date),'2030-01-01T00:01:00.000Z');expect(release).toHaveBeenCalled();
  });

  it('records failure and releases on inhibitor errors',async()=>{
    const inhibitor={status:vi.fn(),acquire:vi.fn(async()=>{throw new Error('unavailable');})};const store={get:vi.fn(()=>({alarmId:'a',occurrenceAt:'2030-01-01T00:01:00.000Z',status:'requested'})),markActive:vi.fn(),markReleased:vi.fn(),markFailed:vi.fn()};
    await expect(runAlarmGuard('a','2030-01-01T00:01:00Z',inhibitor as never,store as never,()=>new Date('2030-01-01T00:00:00Z'))).rejects.toThrow('unavailable');
    expect(store.markFailed).toHaveBeenCalledWith('a','unavailable','2030-01-01T00:01:00.000Z');
  });

  it('rejects non-absolute guard occurrences before acquiring',async()=>{const inhibitor={status:vi.fn(),acquire:vi.fn()};await expect(runAlarmGuard('a','2030-01-01T00:01:00',inhibitor as never)).rejects.toThrow(/absolute/i);expect(inhibitor.acquire).not.toHaveBeenCalled();});

  it('force-kills the entire detached Unix process group when graceful cleanup hangs',async()=>{const kill=vi.fn();await terminateGuardTree(42,{platform:'linux',isAlive:()=>true,kill,taskkill:vi.fn(),wait:vi.fn(async()=>{})});expect(kill).toHaveBeenNthCalledWith(1,42,'SIGTERM');expect(kill).toHaveBeenLastCalledWith(-42,'SIGKILL');});

  it('uses Windows tree termination before and during forced cleanup',async()=>{const taskkill=vi.fn(async()=>{});await terminateGuardTree(42,{platform:'win32',isAlive:()=>true,kill:vi.fn(),taskkill,wait:vi.fn(async()=>{})});expect(taskkill.mock.calls).toEqual([[42,false],[42,true]]);});

  it('fails and releases immediately when the inhibitor helper exits',async()=>{const release=vi.fn(async()=>{});const inhibitor={status:vi.fn(),acquire:vi.fn(async()=>({release,unexpectedExit:Promise.resolve(new Error('helper exited'))}))};const state={alarmId:'a',occurrenceAt:'2030-01-01T00:01:00.000Z',status:'requested'};const store={get:vi.fn(()=>state),markActive:vi.fn(()=>{state.status='active';}),markReleased:vi.fn(),markFailed:vi.fn((_id,_message)=>{state.status='failed';})};await expect(runAlarmGuard('a','2030-01-01T00:01:00Z',inhibitor as never,store as never,()=>new Date('2030-01-01T00:00:00Z'),()=>new Promise(()=>{}))).rejects.toThrow(/helper exited/);expect(store.markFailed).toHaveBeenCalled();expect(release).toHaveBeenCalled();});

  it('serializes concurrent starts and accepts only a token-confirmed child',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-owner-'));
    try{
      const store=new AlarmPowerGuardStore(join(root,'power.json'));
      const spawn=vi.fn((_command:string,args:string[])=>{
        const pidPath=args.at(-2)!;const token=args.at(-1)!;
        queueMicrotask(()=>{const occurrenceAt=args.at(-3)!;writeFileSync(pidPath,JSON.stringify({alarmId:'a',occurrenceAt,pid:process.pid,port:43210,token}),{mode:0o600});store.markActive('a',new Date(),occurrenceAt);});
        return{pid:process.pid,unref:vi.fn()};
      });
      const alarm:Alarm={id:'a',label:'Wake',enabled:true,station:{id:'x',provider:'radio-browser',name:'X',tags:[]},schedule:{type:'once',at:'2030-01-01T00:01:00.000Z'},playback:{volume:30,fadeSeconds:0,stopAfterMinutes:30},reliability:{missedRunGraceMinutes:10,wakeIfSupported:false},createdAt:'x',updatedAt:'x'};
      const service=new AlarmGuardService(store,'node','cli.js',spawn,()=>new Date('2030-01-01T00:00:00Z'),join(root,'guards'),async guard=>guard.token.length===64);
      const [first,second]=await Promise.all([service.start(alarm),service.start(alarm)]);
      expect(first).toEqual(second);expect(spawn).toHaveBeenCalledTimes(1);expect((await service.status()).active).toBe(true);
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('retains a live unverified PID for repair without signaling it',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-stale-'));
    try{
      const directory=join(root,'guards');const store=new AlarmPowerGuardStore(join(root,'power.json'));
      const stop=vi.fn(async()=>true);const service=new AlarmGuardService(store,'node','cli.js',vi.fn(),()=>new Date(),directory,async()=>false,stop);
      const alarmId='a';const occurrenceAt='2030-01-01T00:01:00.000Z';const path=join(directory,`${Buffer.from(`${alarmId}\0${occurrenceAt}`).toString('base64url')}.json`);mkdirSync(directory,{recursive:true});
      writeFileSync(path,JSON.stringify({alarmId,occurrenceAt,pid:process.pid,port:43210,token:'a'.repeat(64)}),{mode:0o600});
      expect(await service.status()).toMatchObject({active:false,guards:[],unresolvedGuards:[{alarmId,occurrenceAt,pid:process.pid}]});
      expect(await service.stop(alarmId)).toBe(false);expect(readFileSync(path,'utf8')).toContain('"alarmId":"a"');expect(stop).not.toHaveBeenCalled();
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('blocks replacement when the previous live guard cannot prove ownership',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-unresolved-'));
    try{
      const directory=join(root,'guards');const store=new AlarmPowerGuardStore(join(root,'power.json'));
      const stop=vi.fn(async()=>true);const spawn=vi.fn();const service=new AlarmGuardService(store,'node','cli.js',spawn,()=>new Date('2030-01-01T00:00:00Z'),directory,async()=>false,stop);
      const alarm:Alarm={id:'a',label:'Wake',enabled:true,station:{id:'x',provider:'radio-browser',name:'X',tags:[]},schedule:{type:'once',at:'2030-01-01T00:02:00.000Z'},playback:{volume:30,fadeSeconds:0,stopAfterMinutes:30},reliability:{missedRunGraceMinutes:10,wakeIfSupported:false},createdAt:'x',updatedAt:'x'};
      const occurrenceAt='2030-01-01T00:01:00.000Z';const path=join(directory,`${Buffer.from(`a\0${occurrenceAt}`).toString('base64url')}.json`);mkdirSync(directory,{recursive:true});
      writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt,pid:process.pid,port:43210,token:'a'.repeat(64)}),{mode:0o600});
      await expect(service.start(alarm)).rejects.toThrow(/ownership.*repair/i);
      expect(spawn).not.toHaveBeenCalled();expect(stop).not.toHaveBeenCalled();expect(readFileSync(path,'utf8')).toContain(occurrenceAt);
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('removes a guard record only when its process is confirmed absent',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-dead-'));
    const kill=vi.spyOn(process,'kill').mockImplementation(()=>{throw Object.assign(new Error('No process'),{code:'ESRCH'});});
    try{
      const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const occurrenceAt='2030-01-01T00:01:00.000Z';const path=join(directory,`${Buffer.from(`a\0${occurrenceAt}`).toString('base64url')}.json`);
      writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt,pid:42,port:43210,token:'a'.repeat(64)}));
      const service=new AlarmGuardService(new AlarmPowerGuardStore(join(root,'power.json')),'node','cli.js',vi.fn(),()=>new Date(),directory,async()=>false,vi.fn());
      expect(await service.status()).toMatchObject({active:false,guards:[],unresolvedGuards:[]});expect(()=>readFileSync(path)).toThrow();expect(kill).toHaveBeenCalledWith(42,0);
    }finally{kill.mockRestore();rmSync(root,{recursive:true,force:true});}
  });

  it('retains permission-denied process state as unresolved',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-eperm-'));
    const kill=vi.spyOn(process,'kill').mockImplementation(()=>{throw Object.assign(new Error('Permission denied'),{code:'EPERM'});});
    try{
      const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const occurrenceAt='2030-01-01T00:01:00.000Z';const path=join(directory,`${Buffer.from(`a\0${occurrenceAt}`).toString('base64url')}.json`);
      writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt,pid:42,port:43210,token:'a'.repeat(64)}));
      const service=new AlarmGuardService(new AlarmPowerGuardStore(join(root,'power.json')),'node','cli.js',vi.fn(),()=>new Date(),directory,async()=>false,vi.fn());
      expect(await service.stop('a')).toBe(false);expect(await service.status()).toMatchObject({active:false,unresolvedGuards:[{alarmId:'a',pid:42}]});expect(readFileSync(path,'utf8')).toContain('"pid":42');expect(kill.mock.calls.every(call=>call[1]===0)).toBe(true);
    }finally{kill.mockRestore();rmSync(root,{recursive:true,force:true});}
  });

  it('does not contact a non-loopback host from an ownership artifact',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-host-'));
    try{
      const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const path=join(directory,'untrusted.json');writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt:'2030-01-01T00:01:00.000Z',pid:process.pid,host:'example.com',port:43210,token:'a'.repeat(64)}));
      const verify=vi.fn(async()=>true);const service=new AlarmGuardService(new AlarmPowerGuardStore(join(root,'power.json')),'node','cli.js',vi.fn(),()=>new Date(),directory,verify);
      expect(await service.status()).toMatchObject({active:false,guards:[],unresolvedGuards:[expect.any(Object)]});expect(verify).not.toHaveBeenCalled();expect(readFileSync(path,'utf8')).toContain('example.com');
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('reclaims an orphaned ownership directory even when its created metadata is missing',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-lock-'));try{const directory=join(root,'guards');const lock=join(directory,`.lock-${Buffer.from('a').toString('base64url')}`);mkdirSync(lock,{recursive:true});utimesSync(lock,new Date(0),new Date(0));const store=new AlarmPowerGuardStore(join(root,'power.json'));const spawn=vi.fn((_command:string,args:string[])=>{const occurrenceAt=args.at(-3)!;const path=args.at(-2)!;const token=args.at(-1)!;queueMicrotask(()=>{writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt,pid:process.pid,port:1234,token}),{mode:0o600});store.markActive('a',new Date(),occurrenceAt);});return{pid:process.pid,unref:vi.fn()};});const alarm:Alarm={id:'a',label:'Wake',enabled:true,station:{id:'x',provider:'radio-browser',name:'X',tags:[]},schedule:{type:'once',at:'2030-01-01T00:01:00.000Z'},playback:{volume:30,fadeSeconds:0,stopAfterMinutes:30},reliability:{missedRunGraceMinutes:10,wakeIfSupported:false},createdAt:'x',updatedAt:'x'};const service=new AlarmGuardService(store,'node','cli.js',spawn,()=>new Date('2030-01-01T00:00:00Z'),directory,async()=>true);await expect(service.start(alarm)).resolves.toMatchObject({pid:process.pid});}finally{rmSync(root,{recursive:true,force:true});}});

  it('serves an authenticated loopback challenge and stop control',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-control-'));try{const path=join(root,'guard.json');const token='b'.repeat(64);const store=new AlarmPowerGuardStore(join(root,'power.json'));const release=vi.fn(async()=>{});const running=runAlarmGuard('a','2030-01-01T00:01:00Z',{status:vi.fn(),acquire:vi.fn(async()=>({release}))},store,()=>new Date('2030-01-01T00:00:00Z'),()=>new Promise(()=>{}),path,token);for(let attempt=0;attempt<20&&!readFile(path);attempt+=1)await new Promise(resolve=>setTimeout(resolve,5));const artifact=JSON.parse(readFileSync(path,'utf8')) as {port:number};expect(await controlRequest(artifact.port,token,'GET','/challenge')).toMatchObject({status:200,body:expect.stringContaining('"alarmId":"a"')});expect(await controlRequest(artifact.port,'wrong','POST','/stop')).toMatchObject({status:401});expect(await controlRequest(artifact.port,token,'POST','/stop')).toMatchObject({status:200});await running;expect(release).toHaveBeenCalled();expect(()=>readFileSync(path)).toThrow();}finally{rmSync(root,{recursive:true,force:true});}});

  it('does not delete a transiently malformed ownership artifact while reading status',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-parse-'));try{const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const path=join(directory,'partial.json');writeFileSync(path,'{"alarmId":');const service=new AlarmGuardService(new AlarmPowerGuardStore(join(root,'power.json')),'node','cli.js',vi.fn(),()=>new Date(),directory);expect((await service.status()).active).toBe(false);expect(readFileSync(path,'utf8')).toBe('{"alarmId":');}finally{rmSync(root,{recursive:true,force:true});}});

  it('publishes and challenges its IPv6 loopback endpoint when IPv4 is unavailable',async context=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-ipv6-'));const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const path=join(directory,'guard.json');const token='c'.repeat(64);const store=new AlarmPowerGuardStore(join(root,'power.json'));const release=vi.fn(async()=>{});
    const listen=vi.spyOn(Server.prototype,'listen').mockImplementationOnce(function(this:Server){queueMicrotask(()=>this.emit('error',Object.assign(new Error('IPv4 unavailable'),{code:'EAFNOSUPPORT'})));return this;});
    let failed:unknown;const running=runAlarmGuard('a','2030-01-01T00:01:00Z',{status:vi.fn(),acquire:vi.fn(async()=>({release}))},store,()=>new Date('2030-01-01T00:00:00Z'),()=>new Promise(()=>{}),path,token);void running.catch(error=>{failed=error;});
    let artifact:{host:'::1';port:number}|undefined;
    try{
      for(let attempt=0;attempt<40&&!readFile(path)&&!failed;attempt+=1)await new Promise(resolve=>setTimeout(resolve,5));
      if(failed&&['EAFNOSUPPORT','EPROTONOSUPPORT','EADDRNOTAVAIL'].includes((failed as NodeJS.ErrnoException).code??''))context.skip('The host does not provide IPv6 loopback.');
      if(failed)throw failed;
      artifact=JSON.parse(readFileSync(path,'utf8')) as typeof artifact;expect(artifact?.host).toBe('::1');
      const service=new AlarmGuardService(store,'node','cli.js',vi.fn(),()=>new Date(),directory);
      expect(await service.status()).toMatchObject({active:true,guards:[{alarmId:'a',pid:process.pid}],unresolvedGuards:[]});
      expect(await controlRequest(artifact!.port,token,'POST','/stop',artifact!.host)).toMatchObject({status:200});await running;expect(release).toHaveBeenCalled();
    }finally{
      if(artifact&&readFile(path))await controlRequest(artifact.port,token,'POST','/stop',artifact.host).catch(()=>undefined);
      if(artifact||failed)await running.catch(()=>undefined);
      listen.mockRestore();rmSync(root,{recursive:true,force:true});
    }
  });
});

describe('alarm-specific Guard ownership', () => {
  const oldOccurrence = '2030-01-01T00:01:00.000Z';
  const nameFor = (alarmId: string) => `${Buffer.from(`${alarmId}\0${oldOccurrence}`).toString('base64url')}.json`;
  const ownerFor = (alarmId: string) => JSON.stringify({alarmId, occurrenceAt: oldOccurrence, pid: process.pid, port: 43210, token: 'a'.repeat(64)});

  async function withRecord(name: string, contents: string, check: (fixture: {
    service: AlarmGuardService;
    alarm: Alarm;
    path: string;
    directory: string;
    spawn: ReturnType<typeof vi.fn>;
  }) => Promise<void>): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-guard-record-scope-'));
    try {
      const directory = join(root, 'guards');
      mkdirSync(directory);
      const path = join(directory, name);
      writeFileSync(path, contents);
      const store = new AlarmPowerGuardStore(join(root, 'power.json'));
      let spawnedToken: string | undefined;
      const spawn = vi.fn((_command: string, args: string[]) => {
        const occurrenceAt = args.at(-3)!;
        const pidPath = args.at(-2)!;
        const token = args.at(-1)!;
        spawnedToken = token;
        writeFileSync(pidPath, JSON.stringify({alarmId: 'a', occurrenceAt, pid: process.pid, port: 43210, token}));
        store.markActive('a', new Date(), occurrenceAt);
        return {pid: process.pid, unref: vi.fn()};
      });
      const alarm: Alarm = {
        id: 'a', label: 'Wake', enabled: true,
        station: {id: 'x', provider: 'radio-browser', name: 'X', tags: []},
        schedule: {type: 'once', at: '2030-01-01T00:02:00.000Z'},
        playback: {volume: 30, fadeSeconds: 0, stopAfterMinutes: 30},
        reliability: {missedRunGraceMinutes: 10, wakeIfSupported: false},
        createdAt: 'x', updatedAt: 'x'
      };
      const service = new AlarmGuardService(store, 'node', 'cli.js', spawn, () => new Date('2030-01-01T00:00:00Z'), directory, async owner => owner.token === spawnedToken, vi.fn(async () => false));
      await check({service, alarm, path, directory, spawn});
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  }

  it.each([
    {name: 'partial.json', contents: '{"alarmId":', reason: 'an undecodable filename'},
    {name: nameFor('b'), contents: '{"alarmId":', reason: 'another alarm encoded in its filename'},
    {name: nameFor('a'), contents: ownerFor('b'), reason: 'a parsed owner ID that differs from its filename'}
  ])('starts an unrelated alarm despite $reason', async ({name, contents}) => {
    await withRecord(name, contents, async ({service, alarm, path, spawn}) => {
      await expect(service.start(alarm)).resolves.toMatchObject({pid: process.pid, occurrenceAt: alarm.schedule.type === 'once' ? alarm.schedule.at : undefined});
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(readFileSync(path, 'utf8')).toBe(contents);
    });
  });

  it.each([
    {name: nameFor('a'), contents: '{"alarmId":', reason: 'its own encoded filename'},
    {name: nameFor('b'), contents: ownerFor('a'), reason: 'its own parsed owner ID'}
  ])('blocks a replacement identified by $reason', async ({name, contents}) => {
    await withRecord(name, contents, async ({service, alarm, path, spawn}) => {
      await expect(service.start(alarm)).rejects.toThrow(/ownership.*repair/i);
      expect(spawn).not.toHaveBeenCalled();
      expect(readFileSync(path, 'utf8')).toBe(contents);
    });
  });

  it('reports one alarm stopped while retaining an unknown record for global repair', async () => {
    await withRecord('partial.json', '{"alarmId":', async ({service, path, directory}) => {
      const knownPath = join(directory, nameFor('a'));
      writeFileSync(knownPath, ownerFor('a'));
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => {throw Object.assign(new Error('No process'), {code: 'ESRCH'});});
      try {
        expect(await service.stop('a')).toBe(true);
        expect(() => readFileSync(knownPath)).toThrow();
        expect(await service.stop()).toBe(false);
        expect(await service.status()).toMatchObject({active: false, guards: [], unresolvedGuards: [{message: expect.stringContaining('retained for repair')}]});
        expect(readFileSync(path, 'utf8')).toBe('{"alarmId":');
        expect(kill.mock.calls.every(call => call[1] === 0)).toBe(true);
      } finally {
        kill.mockRestore();
      }
    });
  });
});

function readFile(path:string){try{readFileSync(path);return true;}catch{return false;}}
function controlRequest(port:number,token:string,method:string,path:string,host='127.0.0.1'):Promise<{status:number;body:string}>{return new Promise((resolve,reject)=>{const req=request({host,port,path,method,agent:false,headers:{authorization:`Bearer ${token}`}},res=>{let body='';res.on('data',chunk=>body+=String(chunk));res.on('end',()=>resolve({status:res.statusCode??0,body}));});req.once('error',reject);req.end();});}
