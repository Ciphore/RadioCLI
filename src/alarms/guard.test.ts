import {mkdirSync,mkdtempSync,readFileSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
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

  it('does not signal a reused PID without a fresh ownership heartbeat',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-guard-stale-'));
    try{
      const directory=join(root,'guards');const store=new AlarmPowerGuardStore(join(root,'power.json'));
      const stop=vi.fn(async()=>true);const service=new AlarmGuardService(store,'node','cli.js',vi.fn(),()=>new Date(),directory,async()=>false,stop);
      const alarmId='a';const occurrenceAt='2030-01-01T00:01:00.000Z';const path=join(directory,`${Buffer.from(`${alarmId}\0${occurrenceAt}`).toString('base64url')}.json`);mkdirSync(directory,{recursive:true});
      writeFileSync(path,JSON.stringify({alarmId,occurrenceAt,pid:process.pid,port:43210,token:'a'.repeat(64)}),{mode:0o600});
      expect((await service.status()).active).toBe(false);expect(()=>readFileSync(path)).toThrow();expect(stop).not.toHaveBeenCalled();
    }finally{rmSync(root,{recursive:true,force:true});}
  });

  it('reclaims an orphaned ownership directory even when its created metadata is missing',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-lock-'));try{const directory=join(root,'guards');const lock=join(directory,`.lock-${Buffer.from('a').toString('base64url')}`);mkdirSync(lock,{recursive:true});utimesSync(lock,new Date(0),new Date(0));const store=new AlarmPowerGuardStore(join(root,'power.json'));const spawn=vi.fn((_command:string,args:string[])=>{const occurrenceAt=args.at(-3)!;const path=args.at(-2)!;const token=args.at(-1)!;queueMicrotask(()=>{writeFileSync(path,JSON.stringify({alarmId:'a',occurrenceAt,pid:process.pid,port:1234,token}),{mode:0o600});store.markActive('a',new Date(),occurrenceAt);});return{pid:process.pid,unref:vi.fn()};});const alarm:Alarm={id:'a',label:'Wake',enabled:true,station:{id:'x',provider:'radio-browser',name:'X',tags:[]},schedule:{type:'once',at:'2030-01-01T00:01:00.000Z'},playback:{volume:30,fadeSeconds:0,stopAfterMinutes:30},reliability:{missedRunGraceMinutes:10,wakeIfSupported:false},createdAt:'x',updatedAt:'x'};const service=new AlarmGuardService(store,'node','cli.js',spawn,()=>new Date('2030-01-01T00:00:00Z'),directory,async()=>true);await expect(service.start(alarm)).resolves.toMatchObject({pid:process.pid});}finally{rmSync(root,{recursive:true,force:true});}});

  it('serves an authenticated loopback challenge and stop control',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-control-'));try{const path=join(root,'guard.json');const token='b'.repeat(64);const store=new AlarmPowerGuardStore(join(root,'power.json'));const release=vi.fn(async()=>{});const running=runAlarmGuard('a','2030-01-01T00:01:00Z',{status:vi.fn(),acquire:vi.fn(async()=>({release}))},store,()=>new Date('2030-01-01T00:00:00Z'),()=>new Promise(()=>{}),path,token);for(let attempt=0;attempt<20&&!readFile(path);attempt+=1)await new Promise(resolve=>setTimeout(resolve,5));const artifact=JSON.parse(readFileSync(path,'utf8')) as {port:number};expect(await controlRequest(artifact.port,token,'GET','/challenge')).toMatchObject({status:200,body:expect.stringContaining('"alarmId":"a"')});expect(await controlRequest(artifact.port,'wrong','POST','/stop')).toMatchObject({status:401});expect(await controlRequest(artifact.port,token,'POST','/stop')).toMatchObject({status:200});await running;expect(release).toHaveBeenCalled();expect(()=>readFileSync(path)).toThrow();}finally{rmSync(root,{recursive:true,force:true});}});

  it('does not delete a transiently malformed ownership artifact while reading status',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-guard-parse-'));try{const directory=join(root,'guards');mkdirSync(directory,{recursive:true});const path=join(directory,'partial.json');writeFileSync(path,'{"alarmId":');const service=new AlarmGuardService(new AlarmPowerGuardStore(join(root,'power.json')),'node','cli.js',vi.fn(),()=>new Date(),directory);expect((await service.status()).active).toBe(false);expect(readFileSync(path,'utf8')).toBe('{"alarmId":');}finally{rmSync(root,{recursive:true,force:true});}});
});

function readFile(path:string){try{readFileSync(path);return true;}catch{return false;}}
function controlRequest(port:number,token:string,method:string,path:string):Promise<{status:number;body:string}>{return new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path,method,headers:{authorization:`Bearer ${token}`}},res=>{let body='';res.on('data',chunk=>body+=String(chunk));res.on('end',()=>resolve({status:res.statusCode??0,body}));});req.once('error',reject);req.end();});}
