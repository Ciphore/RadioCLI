import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';

let directory:string;let mixer:string;
type OutputWorker={held:Promise<void>;call(action:string,fields:Record<string,unknown>):Promise<void>;stop():Promise<void>};
const workers:OutputWorker[]=[];
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'radiocli-volume-process-'));mixer=join(directory,'fake-output.json');writeFileSync(mixer,JSON.stringify({volume:20,muted:true}));});
afterEach(async()=>{await Promise.all(workers.splice(0).map(worker=>worker.stop()));rmSync(directory,{recursive:true,force:true});});
function output(){return JSON.parse(readFileSync(mixer,'utf8')) as {volume:number;muted:boolean};}

describe('system output ownership between real processes',()=>{
  it.each([false,true])('restores once after overlapping processes with separate library profiles end (reverse release: %s)',async reverse=>{
    const [first,second]=await Promise.all([startWorker('first'),startWorker('second')]);
    await first.call('acquire',{key:'a',target:40});await second.call('acquire',{key:'b',target:70});
    await (reverse?second:first).call('release',{key:reverse?'b':'a'});
    expect(output()).toEqual({volume:70,muted:false});
    await (reverse?first:second).call('release',{key:reverse?'a':'b'});
    expect(output()).toEqual({volume:20,muted:true});
    expect(readFileSync(join(directory,'writes.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line))).toEqual([{volume:40,muted:false},{volume:70,muted:false},{volume:20,muted:true}]);
  });

  it('serializes simultaneous acquisition and release across processes',async()=>{
    const [first,second]=await Promise.all([startWorker('first'),startWorker('second')]);
    await Promise.all([first.call('acquire',{key:'a',target:40}),second.call('acquire',{key:'b',target:70})]);
    expect(output()).toEqual({volume:70,muted:false});
    await Promise.all([first.call('release',{key:'a'}),second.call('release',{key:'b'})]);
    expect(output()).toEqual({volume:20,muted:true});
  });

  it('restores the original baseline when an earlier participating process dies',async()=>{
    const first=await startWorker('first');const second=await startWorker('second');
    await first.call('acquire',{key:'a',target:40});await second.call('acquire',{key:'b',target:70});
    await first.stop();expect(output()).toEqual({volume:70,muted:false});
    await second.call('release',{key:'b'});expect(output()).toEqual({volume:20,muted:true});
  });

  it('recovers a dead mutation owner and its persisted baseline after an interrupted write',async()=>{
    const first=await startWorker('first');
    const interrupted=first.call('acquire',{key:'a',target:70,hold:'write'}).catch(()=>undefined);
    await first.held;expect(output()).toEqual({volume:70,muted:false});await first.stop();await interrupted;
    const second=await startWorker('second');await second.call('acquire',{key:'b',target:80});
    await second.call('release',{key:'b'});expect(output()).toEqual({volume:20,muted:true});
  });

  it('preserves a handoff after the original owner exits and another alarm releases',async()=>{
    const first=await startWorker('first');const second=await startWorker('second');
    await first.call('acquire',{key:'a',target:40});await second.call('acquire',{key:'b',target:70});
    await first.call('release',{key:'a',preserve:true});await first.stop();
    await second.call('release',{key:'b'});expect(output()).toEqual({volume:70,muted:false});
    await second.call('acquire',{key:'c',target:90});await second.call('release',{key:'c'});
    expect(output()).toEqual({volume:70,muted:false});
  });
});

async function startWorker(profile:string):Promise<OutputWorker>{
  const source=`
    import {createSystemVolumeController} from ${JSON.stringify(new URL('./system-volume.ts',import.meta.url).href)};
    import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    const [directory,mixer]=process.argv.slice(1);const leases=new Map();let hold;
    const run=async(_command,args)=>{
      if(args.includes('set s to get volume settings')){const state=JSON.parse(readFileSync(mixer,'utf8'));return{code:0,stdout:state.volume+','+state.muted,stderr:''};}
      const match=/set volume output volume (\\d+) (with|without) output muted/.exec(args.join(' '));
      if(!match)throw new Error('Unexpected fake mixer invocation');
      const state={volume:Number(match[1]),muted:match[2]==='with'};
      writeFileSync(mixer,JSON.stringify(state));appendFileSync(join(directory,'writes.jsonl'),JSON.stringify(state)+'\\n');
      if(hold==='write'){process.send({event:'held'});await new Promise(()=>{});}
      return{code:0,stdout:'',stderr:''};
    };
    const controller=createSystemVolumeController('darwin',run,()=>null,{directory});
    process.on('message',async message=>{
      try{
        if(message.action==='acquire'){hold=message.hold;leases.set(message.key,await controller.acquireMinimum(message.target));}
        else if(message.action==='release'){await leases.get(message.key).release({preserve:message.preserve});}
        else throw new Error('Unknown test action');
        process.send({id:message.id});
      }catch(error){process.send({id:message.id,error:String(error)});}
    });
    process.send({event:'ready'});
  `;
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source,directory,mixer],{env:{...process.env,RADIOCLI_HOME:join(directory,profile),XDG_RUNTIME_DIR:join(directory,`${profile}-runtime`)},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,timeout:15_000,killSignal:'SIGKILL'});
  let stderr='';let readyResolve:()=>void=()=>{};let readyReject:(error:Error)=>void=()=>{};let heldResolve:()=>void=()=>{};let sequence=0;
  const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const held=new Promise<void>(resolve=>{heldResolve=resolve;});
  const pending=new Map<number,{resolve():void;reject(error:Error):void}>();
  child.stderr!.on('data',data=>{stderr+=String(data);});
  child.on('message',(message:{event?:string;id?:number;error?:string})=>{
    if(message.event==='ready')readyResolve();else if(message.event==='held')heldResolve();
    else if(message.id!==undefined){const request=pending.get(message.id);pending.delete(message.id);if(message.error)request?.reject(new Error(message.error));else request?.resolve();}
  });
  child.on('error',error=>{readyReject(error);for(const request of pending.values())request.reject(error);pending.clear();});
  const closed=new Promise<void>(resolve=>child.once('close',()=>{const error=new Error(`Fake output worker exited: ${stderr}`);readyReject(error);for(const request of pending.values())request.reject(error);pending.clear();resolve();}));
  const worker={
    held,
    call(action:string,fields:Record<string,unknown>){return new Promise<void>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.send({id,action,...fields},error=>{if(error){pending.delete(id);reject(error);}});});},
    async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
  };
  workers.push(worker);await ready;return worker;
}
