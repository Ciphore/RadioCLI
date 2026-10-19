import type {OutputIdentity,OutputSnapshot} from './system-volume-ownership.js';

type Result={code:number;stdout:string;stderr:string};
type Run=(command:string,args:string[])=>Promise<Result>;
export type LinuxVolumeBackend={
  select?():Promise<OutputIdentity>;
  read(output?:OutputIdentity):Promise<OutputSnapshot>;
  write(value:OutputSnapshot,execute?:Run,output?:OutputIdentity):Promise<void>;
};

/** Never persist or mutate a default-sink alias: it can change during an alarm. */
export function linuxVolumeBackend(run:Run,resolve:(command:string)=>string|null):LinuxVolumeBackend|undefined{
  const wpctl=resolve('wpctl');
  if(wpctl){
    const identity=async(id:string):Promise<Extract<OutputIdentity,{kind:'pipewire'}>>=>{
      const [status,detail]=await Promise.all([
        checked(run(wpctl,['status']),'identify the PipeWire server'),
        checked(run(wpctl,['inspect',id]),'identify the PipeWire output')
      ]);
      const server=/^PipeWire .+cookie:\s*(\d{1,20})\]/m.exec(status)?.[1];
      const node=/^id (\d{1,20}), type PipeWire:Interface:Node\s*$/m.exec(detail)?.[1];
      const property=(name:string)=>new RegExp(`^\\s*\\*?\\s*${name.replaceAll('.','\\.')} = "([^"\\r\\n]+)"\\s*$`,'m').exec(detail)?.[1];
      const serial=property('object.serial');const name=property('node.name');
      if(!server||!node||!serial||!/^\d{1,20}$/.test(serial)||!validName(name)||property('media.class')!=='Audio/Sink')throw new Error('PipeWire returned an unreadable output identity; no default-output mutation is safe.');
      return{kind:'pipewire',server,id:node,serial,name};
    };
    const verify=async(output:OutputIdentity|undefined)=>{
      if(!output||output.kind==='pulse')throw changedOutput();
      const id=output.kind==='pipewire'?output.id:output.nodeId;
      const current=await identity(id);
      if(current.server!==output.server||current.id!==id||current.serial!==output.serial||current.name!==output.name)throw changedOutput();
      return id;
    };
    return{
      select:()=>identity('@DEFAULT_AUDIO_SINK@'),
      async read(output){
        const id=await verify(output);
        const text=await checked(run(wpctl,['get-volume',id]),'read PipeWire output volume');
        const match=/Volume:\s*(\d+(?:\.\d+)?)(?:\s|$)/i.exec(text);
        if(!match)throw new Error('wpctl returned an unreadable output-volume state.');
        await verify(output);
        return{volume:clamp(Number(match[1])*100),muted:/\[MUTED\]/i.test(text)};
      },
      async write(value,execute=run,output){
        const id=await verify(output);
        await checked(execute(wpctl,['set-volume',id,`${clamp(value.volume)}%`]),'set PipeWire output volume');
        // A hot-unplug between the two commands must not unmute a reused ID.
        await verify(output);
        await checked(execute(wpctl,['set-mute',id,value.muted?'1':'0']),'set PipeWire mute state');
      }
    };
  }

  const pactl=resolve('pactl');
  if(pactl){
    // The C-locale textual interface also supports PulseAudio versions predating
    // pactl's JSON output. Its public server cookie changes across restarts.
    const info=async()=>{
      const text=await checked(run(pactl,['info']),'identify the PulseAudio server');
      const server=/^Cookie:\s*([\da-f]+(?::[\da-f]+)*)\s*$/im.exec(text)?.[1]?.toLowerCase();
      const name=/^Default Sink:\s*(.+)\s*$/m.exec(text)?.[1]?.trim();
      if(!validName(server))throw new Error('PulseAudio returned an unreadable server identity; no default-output mutation is safe.');
      const pipewire=/^Server Name: PulseAudio \(on PipeWire [\w.+-]+\)\s*$/m.test(text);
      const cookie=/^([\da-f]{1,4}):([\da-f]{1,4})$/.exec(server);
      if(pipewire&&!cookie)throw new Error('PulseAudio returned an unreadable PipeWire server cookie.');
      // PipeWire's Pulse server exposes the same core cookie as wpctl, rendered
      // as two hexadecimal words. Classic PulseAudio stays in a separate domain.
      return{pipewire,server:pipewire?Number.parseInt(`${cookie![1]!.padStart(4,'0')}${cookie![2]!.padStart(4,'0')}`,16).toString():server,name:validName(name)?name:undefined};
    };
    const sinks=async(server:Awaited<ReturnType<typeof info>>):Promise<Array<Exclude<OutputIdentity,{kind:'pipewire'}>>>=>{
      const text=await checked(run(pactl,server.pipewire?['list','sinks']:['list','short','sinks']),'identify PulseAudio outputs');
      const outputs:Array<Exclude<OutputIdentity,{kind:'pipewire'}>>=server.pipewire?parsePipeWireSinks(text,server.server):text.split(/\r?\n/).filter(Boolean).map(line=>{
        const [id,name]=line.split('\t');
        if(!id||!/^\d{1,20}$/.test(id)||!validName(name))throw new Error('PulseAudio returned an unreadable output identity.');
        return{kind:'pulse',server:server.server,id,name};
      });
      if(new Set(outputs.map(item=>item.id)).size!==outputs.length||new Set(outputs.map(item=>item.name)).size!==outputs.length)throw new Error('PulseAudio returned ambiguous output identities.');
      return outputs;
    };
    const verify=async(output:OutputIdentity|undefined)=>{
      if(!output)throw changedOutput();
      const server=await info();const outputs=await sinks(server);
      if(server.server!==output.server)throw changedOutput();
      const current=outputs.find(item=>{
        if(output.kind==='pulse')return item.kind==='pulse'&&item.id===output.id&&item.name===output.name;
        if(item.kind!=='pulse-pipewire'||item.serial!==output.serial||item.name!==output.name)return false;
        return output.kind==='pipewire'?item.nodeId===output.id:item.nodeId===output.nodeId&&item.id===output.id&&item.sinkName===output.sinkName;
      });
      if(!current)throw changedOutput();
      return current.id;
    };
    return{
      async select(){
        const server=await info();const outputs=await sinks(server);
        const output=outputs.find(item=>(item.kind==='pulse-pipewire'?item.sinkName:item.name)===server.name);
        if(!output)throw new Error('The default PulseAudio output is unavailable.');
        return output;
      },
      async read(output){
        const id=await verify(output);
        const [volume,mute]=await Promise.all([
          checked(run(pactl,['get-sink-volume',id]),'read PulseAudio output volume'),
          checked(run(pactl,['get-sink-mute',id]),'read PulseAudio mute state')
        ]);
        const match=/(\d+)%/.exec(volume);const muted=/^Mute:\s*(yes|no)\s*$/im.exec(mute);
        if(!match||!muted)throw new Error('pactl returned an unreadable output-volume state.');
        await verify(output);
        return{volume:clamp(Number(match[1])),muted:muted[1]!.toLowerCase()==='yes'};
      },
      async write(value,execute=run,output){
        const id=await verify(output);
        await checked(execute(pactl,['set-sink-volume',id,`${clamp(value.volume)}%`]),'set PulseAudio output volume');
        await verify(output);
        await checked(execute(pactl,['set-sink-mute',id,value.muted?'1':'0']),'set PulseAudio mute state');
      }
    };
  }

  const amixer=resolve('amixer');
  if(amixer)return{
    async read(){
      const text=await checked(run(amixer,['get','Master']),'read ALSA output volume');
      const last=[...text.matchAll(/\[(\d+)%\]/g)].at(-1);
      if(!last)throw new Error('amixer returned an unreadable output-volume state.');
      return{volume:clamp(Number(last[1])),muted:/\[off\]/i.test(text)};
    },
    async write(value,execute=run){await checked(execute(amixer,['set','Master',`${clamp(value.volume)}%`,value.muted?'mute':'unmute']),'set ALSA output volume');}
  };
  return undefined;
}

function parsePipeWireSinks(text:string,server:string):Array<Extract<OutputIdentity,{kind:'pulse-pipewire'}>>{
  if(!text.trim())return[];
  return text.split(/(?=^Sink #)/m).filter(block=>block.trim()).map(block=>{
    const id=/^Sink #(\d{1,20})\s*$/m.exec(block)?.[1];
    const sinkName=/^\s+Name:\s*(.+)\s*$/m.exec(block)?.[1]?.trim();
    const property=(name:string)=>new RegExp(`^\\s+${name.replaceAll('.','\\.')} = "([^"\\r\\n]+)"\\s*$`,'m').exec(block)?.[1];
    const nodeId=property('object.id');const serial=property('object.serial');const name=property('node.name');
    if(!id||!nodeId||!/^\d{1,20}$/.test(nodeId)||!serial||!/^\d{1,20}$/.test(serial)||!validName(name)||!validName(sinkName))throw new Error('PulseAudio returned an unreadable PipeWire output identity.');
    return{kind:'pulse-pipewire',server,id,nodeId,serial,name,sinkName};
  });
}

function changedOutput():Error{return new Error('The original alarm output disconnected or its audio-server identity changed. Its saved volume was retained; no replacement output was changed.');}
function validName(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=1024&&!/[\u0000-\u001f\u007f]/.test(value);}
function clamp(value:number){return Math.max(0,Math.min(100,Math.round(Number.isFinite(value)?value:0)));}
async function checked(promise:Promise<Result>,label:string):Promise<string>{const result=await promise;if(result.code!==0)throw new Error(`${label} failed: ${(result.stderr||result.stdout||`exit ${result.code}`).trim()}`);if(Buffer.byteLength(result.stdout)>64*1024)throw new Error(`${label} returned too much data.`);return result.stdout;}
