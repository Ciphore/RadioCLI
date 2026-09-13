import {mkdtempSync, readFileSync, rmSync, statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {connectActiveAlarm,connectActiveAlarms, startActiveAlarmSession} from './active-session.js';
import {createSystemVolumeController} from './system-volume.js';
import {SystemVolumeOwnership} from './system-volume-ownership.js';

const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));

it('waits for handoff ownership contention beyond the short discovery deadline',async()=>{
  const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-handoff-lock-'));dirs.push(root);
  const directory=join(root,'volume');
  const run=async(_command:string,args:string[])=>({code:0,stdout:args.includes('set s to get volume settings')?'20,true':'',stderr:''});
  const lease=await createSystemVolumeController('darwin',run,()=>null,{directory}).acquireMinimum(70);
  let unlock:()=>void=()=>{};let lockReady:()=>void=()=>{};
  const ready=new Promise<void>(resolve=>{lockReady=resolve;});
  const holding=new SystemVolumeOwnership(directory).transaction(async()=>{lockReady();await new Promise<void>(resolve=>{unlock=resolve;});});
  await ready;
  let server:Awaited<ReturnType<typeof startActiveAlarmSession>>|undefined;
  let timer:NodeJS.Timeout|undefined;
  let startedHandoff:()=>void=()=>{};
  const started=new Promise<void>(resolve=>{startedHandoff=resolve;});
  let handedOff=false;
  try{
    const file=join(root,'active.json');
    server=await startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'},{
      filePath:file,onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),
      async onHandoff(){startedHandoff();await lease.release({preserve:true});handedOff=true;}
    });
    const client=await connectActiveAlarm(file);
    const handoff=client!.handoff().then(()=>({ok:true}),error=>({error}));
    await started;
    timer=setTimeout(unlock,1_200);
    expect(await handoff).toEqual({ok:true});
    expect(handedOff).toBe(true);
  }finally{
    clearTimeout(timer);unlock();await holding;
    await server?.close();await lease.release();
  }
});

describe('active alarm IPC',()=>{
  it('discovers, authenticates, controls, and removes a local session',async()=>{
    const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-'));dirs.push(root);const file=join(root,'active.json');
    const dismiss=vi.fn();
    const server=await startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'Jazz',startedAt:'2030-01-01T00:00:00Z'}, {filePath:file,onDismiss:dismiss,onSnooze:vi.fn(),onKeepPlaying:vi.fn()});
    expect(JSON.parse(readFileSync(file,'utf8')).token).toBeTruthy();
    if(process.platform!=='win32')expect(statSync(file).mode&0o777).toBe(0o600);
    const client=await connectActiveAlarm(file);
    expect((await client!.status()).stationName).toBe('Jazz');
    await client!.dismiss();expect(dismiss).toHaveBeenCalled();
    await server.close();
    expect(await connectActiveAlarm(file)).toBeNull();
  });

  for (const host of ['127.0.0.1', '::1']) {
    it(`authenticates directly to a discovered ${host} alarm endpoint`, async context => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-alarm-family-'));
      dirs.push(root);
      const file = join(root, 'active.json');
      const status = {alarmId: 'family', scheduledAt: '2030-01-01T00:00:00Z', stationName: 'Local radio', startedAt: '2030-01-01T00:00:00Z'};
      let authenticatedRequests = 0;
      const server = createServer((request, response) => {
        if (request.headers.authorization === 'Bearer test-alarm-token') authenticatedRequests += 1;
        request.resume();
        response.end(JSON.stringify(status));
      });
      try {
        await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, host, resolve);});
      } catch (error) {
        if (host === '::1' && ['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          context.skip('The host does not provide IPv6 loopback.');
        }
        throw error;
      }
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No listener address.');
        writeFileSync(file, JSON.stringify({version: 1, host, port: address.port, token: 'test-alarm-token', pid: process.pid, alarmId: 'family'}));
        const client = await connectActiveAlarm(file);
        expect(client).not.toBeNull();
        expect(await client!.status()).toEqual(status);
        expect(authenticatedRequests).toBe(2);
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }
});

it('keeps concurrent alarm sessions independently discoverable and owned',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-many-'));dirs.push(root);const first=await startActiveAlarmSession({alarmId:'one',scheduledAt:'2030-01-01T00:00:00Z',stationName:'One',startedAt:'2030-01-01T00:00:00Z'},{filePath:join(root,'one.json'),onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn()});const second=await startActiveAlarmSession({alarmId:'two',scheduledAt:'2030-01-01T00:00:00Z',stationName:'Two',startedAt:'2030-01-01T00:00:00Z'},{filePath:join(root,'two.json'),onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn()});expect(await connectActiveAlarms(root)).toHaveLength(2);await first.close();expect((await connectActiveAlarms(root))).toHaveLength(1);await second.close();});

it('does not remove a discovery artifact that has been replaced by another owner',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-replaced-'));dirs.push(root);const file=join(root,'active.json');const server=await startActiveAlarmSession({alarmId:'one',scheduledAt:'2030-01-01T00:00:00Z',stationName:'One',startedAt:'2030-01-01T00:00:00Z'},{filePath:file,onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn()});const replacement={version:1,host:'127.0.0.1',port:1234,token:'replacement',pid:1234,alarmId:'two'};writeFileSync(file,JSON.stringify(replacement),{mode:0o600});await server.close();expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(replacement);});

it('retains a partial discovery artifact for a concurrent atomic publisher',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-partial-'));dirs.push(root);const file=join(root,'active.json');writeFileSync(file,'{"version":1');expect(await connectActiveAlarm(file)).toBeNull();expect(readFileSync(file,'utf8')).toBe('{"version":1');});

it('does not unlink a replacement installed while an old endpoint probe fails',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-probe-'));dirs.push(root);const file=join(root,'active.json');writeFileSync(file,JSON.stringify({version:1,host:'127.0.0.1',port:1,token:'old',pid:1,alarmId:'old'}),{mode:0o600});const probing=connectActiveAlarm(file);const replacement={version:1,host:'127.0.0.1',port:2,token:'new',pid:2,alarmId:'new'};writeFileSync(file,JSON.stringify(replacement),{mode:0o600});expect(await probing).toBeNull();expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(replacement);});

it('preserves a live artifact after one transient probe timeout and recovers later',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-slow-'));dirs.push(root);const file=join(root,'active.json');let slow=true;const server=createServer((_request,response)=>{if(slow)setTimeout(()=>response.end('{}'),1100);else response.end(JSON.stringify({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'}));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{const address=server.address();if(!address||typeof address==='string')throw new Error('no address');writeFileSync(file,JSON.stringify({version:1,host:'127.0.0.1',port:address.port,token:'token',pid:process.pid,alarmId:'a'}),{mode:0o600});expect(await connectActiveAlarm(file)).toBeNull();expect(readFileSync(file,'utf8')).toContain('"token":"token"');slow=false;expect(await connectActiveAlarm(file)).not.toBeNull();}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}});

it('race-safely removes unreachable discovery only when its owner is dead or safely stale',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-stale-'));dirs.push(root);const dead=join(root,'dead.json');writeFileSync(dead,JSON.stringify({version:1,host:'127.0.0.1',port:1,token:'dead',pid:2147483647,alarmId:'dead',createdAt:new Date().toISOString()}));expect(await connectActiveAlarm(dead)).toBeNull();expect(()=>readFileSync(dead,'utf8')).toThrow();const stale=join(root,'stale.json');writeFileSync(stale,JSON.stringify({version:1,host:'127.0.0.1',port:1,token:'stale',pid:process.pid,alarmId:'stale',createdAt:'2000-01-01T00:00:00Z'}));expect(await connectActiveAlarm(stale)).toBeNull();expect(()=>readFileSync(stale,'utf8')).toThrow();});

it('accepts only one terminal control action per active session',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-terminal-'));dirs.push(root);const file=join(root,'active.json');let finish!:()=>void;const dismiss=vi.fn(async()=>new Promise<void>(resolve=>{finish=resolve;}));const snooze=vi.fn();const keep=vi.fn();const server=await startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'},{filePath:file,onDismiss:dismiss,onSnooze:snooze,onKeepPlaying:keep});const client=await connectActiveAlarm(file);const terminal=client!.dismiss();await new Promise(resolve=>setImmediate(resolve));await expect(client!.snooze(10)).rejects.toThrow();await expect(client!.keepPlaying()).rejects.toThrow();expect(dismiss).toHaveBeenCalledOnce();expect(snooze).not.toHaveBeenCalled();expect(keep).not.toHaveBeenCalled();finish();await terminal;await server.close();});

it('rolls back a rejected terminal action so the user can retry',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-retry-'));dirs.push(root);const file=join(root,'active.json');const dismiss=vi.fn();const snooze=vi.fn(async()=>{throw new Error('temporary failure');});const keep=vi.fn();const server=await startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'},{filePath:file,onDismiss:dismiss,onSnooze:snooze,onKeepPlaying:keep});const client=await connectActiveAlarm(file);await expect(client!.snooze(10)).rejects.toThrow();await expect(client!.dismiss()).resolves.toBeUndefined();expect(snooze).toHaveBeenCalledOnce();expect(dismiss).toHaveBeenCalledOnce();await server.close();});

it('provides a terminal handoff action for transferring playback into the TUI',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-handoff-'));dirs.push(root);const file=join(root,'active.json');const handoff=vi.fn();const server=await startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'},{filePath:file,onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),onHandoff:handoff});const client=await connectActiveAlarm(file);await client!.handoff();expect(handoff).toHaveBeenCalledOnce();await server.close();});

it('closes its listening server when discovery publication fails',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-alarm-publish-'));dirs.push(root);const handles=()=>((process as unknown as {_getActiveHandles():Array<{listening?:boolean}>})._getActiveHandles()).filter(handle=>handle.listening).length;const before=handles();await expect(startActiveAlarmSession({alarmId:'a',scheduledAt:'2030-01-01T00:00:00Z',stationName:'A',startedAt:'2030-01-01T00:00:00Z'},{filePath:root,onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn()})).rejects.toThrow();expect(handles()).toBe(before);});
