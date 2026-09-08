import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createSystemVolumeController} from './system-volume.js';

vi.mock('node:child_process',async importOriginal=>({...await importOriginal<typeof import('node:child_process')>()}));
vi.mock('node:fs',async importOriginal=>({...await importOriginal<typeof import('node:fs')>()}));
let directory:string;
beforeEach(()=>{directory=fs.mkdtempSync(join(tmpdir(),'radiocli-native-volume-'));});
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(directory,{recursive:true,force:true});});

describe('native system-output command lifetime',()=>{
  it('waits for an orphan native helper before recovering the saved baseline',async()=>{
    const output=join(directory,'fake-output.json');const gate=join(directory,'gate');const helperFile=join(directory,'helper.json');
    fs.writeFileSync(output,JSON.stringify({volume:20,muted:true}));
    const helperSource=`
      const fs=require('node:fs');const [output,gate,helperFile,text]=process.argv.slice(1);const args=JSON.parse(text);
      if(args.includes('set s to get volume settings')){const state=JSON.parse(fs.readFileSync(output,'utf8'));process.stdout.write(state.volume+','+state.muted);}
      else{
        const match=/set volume output volume (\\d+) (with|without) output muted/.exec(args.join(' '));
        const state={volume:Number(match[1]),muted:match[2]==='with'};
        if(state.volume===70){fs.writeFileSync(helperFile,JSON.stringify({pid:process.pid}));const timer=setInterval(()=>{if(fs.existsSync(gate)){fs.writeFileSync(output,JSON.stringify(state));clearInterval(timer);}},10);setTimeout(()=>process.exit(3),8000).unref();}
        else fs.writeFileSync(output,JSON.stringify(state));
      }
    `;
    const source=`
      import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
      const [directory,output,gate,helperFile]=process.argv.slice(1);const original=cp.spawn;
      cp.spawn=(_command,args,options)=>original(process.execPath,['-e',${JSON.stringify(helperSource)},output,gate,helperFile,JSON.stringify(args)],options);
      syncBuiltinESMExports();
      const {createSystemVolumeController}=await import(${JSON.stringify(new URL('./system-volume.ts',import.meta.url).href)});
      await createSystemVolumeController('darwin',undefined,()=>null,{directory}).acquireMinimum(70);
    `;
    const parent=childProcess.spawn(process.execPath,['--import','tsx','--input-type=module','-e',source,directory,output,gate,helperFile],{stdio:'ignore',windowsHide:true,timeout:10_000,killSignal:'SIGKILL'});
    const parentClosed=new Promise<void>(resolve=>parent.once('close',()=>resolve()));
    let helperPid:number|undefined;let acquired=false;let acquisition:ReturnType<ReturnType<typeof createSystemVolumeController>['acquireMinimum']>|undefined;
    try{
      await until(()=>fs.existsSync(helperFile));helperPid=(JSON.parse(fs.readFileSync(helperFile,'utf8')) as {pid:number}).pid;
      expect(JSON.parse(fs.readFileSync(join(directory,'native-write.json'),'utf8'))).toMatchObject({helperPid});
      parent.kill('SIGKILL');await parentClosed;expect(()=>process.kill(helperPid!,0)).not.toThrow();
      const run=async(_command:string,args:string[])=>{
        const before=JSON.parse(fs.readFileSync(output,'utf8')) as {volume:number;muted:boolean};
        if(args.includes('set s to get volume settings'))return{code:0,stdout:`${before.volume},${before.muted}`,stderr:''};
        const match=/set volume output volume (\d+) (with|without) output muted/.exec(args.join(' '));
        fs.writeFileSync(output,JSON.stringify({volume:Number(match![1]),muted:match![2]==='with'}));return{code:0,stdout:'',stderr:''};
      };
      acquisition=createSystemVolumeController('darwin',run,()=>null,{directory,lockTimeoutMs:2_000}).acquireMinimum(80).then(lease=>{acquired=true;return lease;});
      await new Promise(resolve=>setTimeout(resolve,80));expect(acquired).toBe(false);
      fs.writeFileSync(gate,'go');const lease=await acquisition;
      expect(JSON.parse(fs.readFileSync(output,'utf8'))).toEqual({volume:80,muted:false});
      await lease.release();expect(JSON.parse(fs.readFileSync(output,'utf8'))).toEqual({volume:20,muted:true});
      expect(fs.existsSync(join(directory,'native-write.json'))).toBe(false);
    }finally{
      fs.writeFileSync(gate,'go');if(parent.exitCode===null&&parent.signalCode===null)parent.kill('SIGKILL');await parentClosed;
      if(acquisition)await acquisition.then(lease=>lease.release()).catch(()=>{});
      if(helperPid)try{process.kill(helperPid,'SIGKILL');}catch{}
    }
  });

  it('kills and awaits an owned helper when persisting its PID fails',async()=>{
    const writes:ReturnType<typeof fakeChild>[]=[];let saves=0;const rename=fs.renameSync;
    vi.spyOn(fs,'renameSync').mockImplementation((source,destination)=>{if(String(destination)===join(directory,'native-write.json')&&++saves===2)throw new Error('PID disk failure');return rename(source,destination);});
    vi.spyOn(childProcess,'spawn').mockImplementation((_command,args)=>{
      const child=fakeChild();const reading=args?.includes('set s to get volume settings');
      if(reading)queueMicrotask(()=>{child.stdout.write('20,true');child.emit('close',0,null);});
      else{writes.push(child);if(writes.length>1)queueMicrotask(()=>child.emit('close',0,null));}
      return child as unknown as childProcess.ChildProcess;
    });
    let settled=false;const acquisition=createSystemVolumeController('darwin',undefined,()=>null,{directory}).acquireMinimum(70).finally(()=>{settled=true;});
    const rejected=expect(acquisition).rejects.toThrow('PID disk failure');
    await until(()=>writes.length>0);expect(writes[0]!.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);expect(fs.existsSync(join(directory,'lock'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(join(directory,'native-write.json'),'utf8')).helperPid).toBeNull();
    writes[0]!.emit('close',null,'SIGKILL');await rejected;
    expect(fs.existsSync(join(directory,'lock'))).toBe(false);expect(fs.existsSync(join(directory,'native-write.json'))).toBe(false);
  });

  it('clears the native journal when spawning throws before creating a helper',async()=>{
    vi.spyOn(childProcess,'spawn').mockImplementation((_command,args)=>{
      if(!args?.includes('set s to get volume settings'))throw new Error('helper could not start');
      const child=fakeChild();queueMicrotask(()=>{child.stdout.write('20,true');child.emit('close',0,null);});return child as unknown as childProcess.ChildProcess;
    });
    await expect(createSystemVolumeController('darwin',undefined,()=>null,{directory}).acquireMinimum(70)).rejects.toThrow('helper could not start');
    expect(fs.existsSync(join(directory,'native-write.json'))).toBe(false);
    expect(fs.existsSync(join(directory,'state.json'))).toBe(true);
  });

  it('does not start a mutating helper if its intent cannot be journaled',async()=>{
    const rename=fs.renameSync;
    vi.spyOn(fs,'renameSync').mockImplementation((source,destination)=>{if(String(destination)===join(directory,'native-write.json'))throw new Error('native journal disk failure');return rename(source,destination);});
    const spawn=vi.spyOn(childProcess,'spawn').mockImplementation((_command,args)=>{
      expect(args).toContain('set s to get volume settings');
      const child=fakeChild();queueMicrotask(()=>{child.stdout.write('20,true');child.emit('close',0,null);});return child as unknown as childProcess.ChildProcess;
    });
    await expect(createSystemVolumeController('darwin',undefined,()=>null,{directory}).acquireMinimum(70)).rejects.toThrow('native journal disk failure');
    expect(spawn).toHaveBeenCalledOnce();expect(fs.existsSync(join(directory,'state.json'))).toBe(true);
  });
});

function fakeChild(){const child=new EventEmitter() as EventEmitter&{pid:number;stdout:PassThrough;stderr:PassThrough;kill:ReturnType<typeof vi.fn>};child.pid=process.pid;child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=vi.fn(()=>true);return child;}
async function until(predicate:()=>boolean):Promise<void>{const deadline=Date.now()+3_000;while(!predicate()){if(Date.now()>=deadline)throw new Error('Owned fake output helper did not reach the expected state.');await new Promise(resolve=>setTimeout(resolve,10));}}
