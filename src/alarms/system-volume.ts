import {spawn,type ChildProcessByStdio} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {Readable} from 'node:stream';
import {resolveCommand} from '../platform/executables.js';
import {identifyPlatform,nativeAdapters} from '../platform/runtime.js';
import {defaultSystemVolumeDirectory,SystemVolumeOwnership,volumeProcessAlive,type OutputSnapshot,type SystemVolumeState} from './system-volume-ownership.js';

type Snapshot=OutputSnapshot;
type Result={code:number;stdout:string;stderr:string};
type Run=(command:string,args:string[])=>Promise<Result>;
export type SystemVolumeLease={release(options?:{preserve?:boolean}):Promise<void>;message:string};
export type SystemVolumeController={acquireMinimum(volume:number):Promise<SystemVolumeLease>};

export function createSystemVolumeController(platform:NodeJS.Platform=process.platform,run:Run=runCommand,resolve:(command:string)=>string|null=resolveCommand,options:{directory?:string;lockTimeoutMs?:number}={}):SystemVolumeController{
  const host=identifyPlatform({platform});const adapter=nativeAdapters(host).volume;
  const backend=adapter==='macos'?macBackend(run):adapter==='unix-audio'?linuxBackend(run,resolve):adapter==='windows'?windowsBackend(run,resolve):undefined;
  return{async acquireMinimum(volume){
    if(!backend)throw new Error(`System output volume control is unavailable on ${host.id==='unknown'?platform:host.id}.`);
    const ownership=new SystemVolumeOwnership(options.directory??defaultSystemVolumeDirectory(),options.lockTimeoutMs);
    const write=(value:Snapshot)=>backend.write(value,run===runCommand?(command,args)=>runCommand(command,args,ownership):run);
    return ownership.transaction(async()=>{
      let state=ownership.read();
      if(state){
        state.participants=state.participants.filter(activeParticipant);
        if(state.participants.length===0){
          // A crashed owner or failed final restore must not turn the raised
          // output into the next alarm's baseline.
          if(state.changed&&state.baseline)await write(state.baseline);
          ownership.clear();state=undefined;
        }
      }
      const target=clamp(volume);const before=await backend.read();const changed=before.muted||before.volume<target;
      const prior=state;const id=randomUUID();
      const joined:SystemVolumeState={version:1,generation:state?.generation??randomUUID(),baseline:state?.baseline??before,changed:Boolean(state?.changed)||changed,participants:[...state?.participants??[],{id,pid:process.pid,phase:'pending'}]};
      // Persist the original state before any mixer command can partly succeed.
      ownership.save(joined);
      try{
        if(changed)await write({volume:Math.max(before.volume,target),muted:false});
        // Until this commit succeeds, a later transaction can discard the
        // pending participant even if failed cleanup left its PID alive.
        ownership.save({...joined,participants:joined.participants.map(item=>item.id===id?{...item,phase:'active'}:item)});
      }catch(error){
        let restoreError:unknown;
        if(changed)try{await write(before);}catch(cause){restoreError=cause;}
        try{
          if(restoreError)ownership.save({...joined,participants:joined.participants.filter(item=>item.id!==id)});
          else if(prior)ownership.save(prior);else ownership.clear();
        }catch(saveError){throw new Error(`${messageOf(error)}${restoreError?`; restoring the previous output state also failed: ${messageOf(restoreError)}`:''}; output-volume recovery state could not be updated: ${messageOf(saveError)}`);}
        if(restoreError)throw new Error(`${messageOf(error)}; restoring the previous output state also failed: ${messageOf(restoreError)}`);
        throw error;
      }
      let released=false;
      return{
        message:changed?`Local output raised to at least ${target}% and unmuted for the alarm.`:`Local output was already at least ${target}% and unmuted.`,
        async release({preserve=false}={}){
          if(released)return;
          await ownership.transaction(async()=>{
            if(released)return;
            const current=ownership.read();
            if(!current||current.generation!==joined.generation){released=true;return;}
            current.participants=current.participants.filter(item=>item.id!==id&&activeParticipant(item));
            if(preserve){
              // Handoff commits the current output as the user's new baseline.
              // A later acquisition samples it before making another adjustment.
              current.baseline=null;current.changed=false;
            }
            ownership.save(current);
            if(current.participants.length===0){
              if(current.changed&&current.baseline)await write(current.baseline);
              ownership.clear();
            }
            released=true;
          });
        }
      };
    });
  }};
}

function activeParticipant(item:SystemVolumeState['participants'][number]):boolean{return item.phase==='active'&&volumeProcessAlive(item.pid);}

type Backend={read():Promise<Snapshot>;write(value:Snapshot,execute?:Run):Promise<void>};
function macBackend(run:Run):Backend{return{async read(){const result=await checked(run('/usr/bin/osascript',['-e','set s to get volume settings','-e','return (output volume of s as text) & "," & (output muted of s as text)']),'read macOS output volume');const match=/^(\d+)\s*,\s*(true|false)/i.exec(result.stdout.trim());if(!match)throw new Error('macOS returned an unreadable output-volume state.');return{volume:clamp(Number(match[1])),muted:match[2]?.toLowerCase()==='true'};},async write(value,execute=run){await checked(execute('/usr/bin/osascript',['-e',`set volume output volume ${clamp(value.volume)} ${value.muted?'with':'without'} output muted`]),'set macOS output volume');}};}

function linuxBackend(run:Run,resolve:(command:string)=>string|null):Backend|undefined{
  const wpctl=resolve('wpctl');if(wpctl)return{async read(){const result=await checked(run(wpctl,['get-volume','@DEFAULT_AUDIO_SINK@']),'read PipeWire output volume');const match=/Volume:\s*([\d.]+)/i.exec(result.stdout);if(!match)throw new Error('wpctl returned an unreadable output-volume state.');return{volume:clamp(Number(match[1])*100),muted:/\[MUTED\]/i.test(result.stdout)};},async write(value,execute=run){await checked(execute(wpctl,['set-volume','@DEFAULT_AUDIO_SINK@',`${clamp(value.volume)}%`]),'set PipeWire output volume');await checked(execute(wpctl,['set-mute','@DEFAULT_AUDIO_SINK@',value.muted?'1':'0']),'set PipeWire mute state');}};
  const pactl=resolve('pactl');if(pactl)return{async read(){const [volume,mute]=await Promise.all([checked(run(pactl,['get-sink-volume','@DEFAULT_SINK@']),'read PulseAudio output volume'),checked(run(pactl,['get-sink-mute','@DEFAULT_SINK@']),'read PulseAudio mute state')]);const match=/(\d+)%/.exec(volume.stdout);if(!match)throw new Error('pactl returned an unreadable output-volume state.');return{volume:clamp(Number(match[1])),muted:/yes/i.test(mute.stdout)};},async write(value,execute=run){await checked(execute(pactl,['set-sink-volume','@DEFAULT_SINK@',`${clamp(value.volume)}%`]),'set PulseAudio output volume');await checked(execute(pactl,['set-sink-mute','@DEFAULT_SINK@',value.muted?'1':'0']),'set PulseAudio mute state');}};
  const amixer=resolve('amixer');if(amixer)return{async read(){const result=await checked(run(amixer,['get','Master']),'read ALSA output volume');const matches=[...result.stdout.matchAll(/\[(\d+)%\]/g)];const last=matches.at(-1);if(!last)throw new Error('amixer returned an unreadable output-volume state.');return{volume:clamp(Number(last[1])),muted:/\[off\]/i.test(result.stdout)};},async write(value,execute=run){await checked(execute(amixer,['set','Master',`${clamp(value.volume)}%`,value.muted?'mute':'unmute']),'set ALSA output volume');}};
  return undefined;
}

function windowsBackend(run:Run,resolve:(command:string)=>string|null):Backend|undefined{const powershell=resolve('powershell.exe')??resolve('pwsh.exe');if(!powershell)return undefined;return{async read(){const result=await checked(run(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`${windowsCoreAudio}; [RadioCliVolume]::Get()`]),'read Windows output volume');const match=/^(\d+)\s*,\s*(true|false)/im.exec(result.stdout);if(!match)throw new Error('Windows returned an unreadable output-volume state.');return{volume:clamp(Number(match[1])),muted:match[2]?.toLowerCase()==='true'};},async write(value,execute=run){await checked(execute(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`${windowsCoreAudio}; [RadioCliVolume]::Set(${clamp(value.volume)}, $${value.muted?'true':'false'})`]),'set Windows output volume');}};}

const windowsCoreAudio=String.raw`Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public enum EDataFlow { eRender, eCapture, eAll } public enum ERole { eConsole, eMultimedia, eCommunications }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { int EnumAudioEndpoints(EDataFlow a,uint b,out object c); int GetDefaultAudioEndpoint(EDataFlow a,ERole b,out IMMDevice c); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { int Activate(ref Guid id,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object result); }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume { int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out uint c); int SetMasterVolumeLevel(float l,Guid g); int SetMasterVolumeLevelScalar(float l,Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l); int SetChannelVolumeLevel(uint c,float l,Guid g); int SetChannelVolumeLevelScalar(uint c,float l,Guid g); int GetChannelVolumeLevel(uint c,out float l); int GetChannelVolumeLevelScalar(uint c,out float l); int SetMute([MarshalAs(UnmanagedType.Bool)] bool m,Guid g); int GetMute(out bool m); }
public static class RadioCliVolume { static IAudioEndpointVolume Endpoint(){IMMDevice d;((IMMDeviceEnumerator)new MMDeviceEnumerator()).GetDefaultAudioEndpoint(EDataFlow.eRender,ERole.eMultimedia,out d);object o;Guid id=typeof(IAudioEndpointVolume).GUID;d.Activate(ref id,23,IntPtr.Zero,out o);return(IAudioEndpointVolume)o;} public static string Get(){float v;bool m;var e=Endpoint();e.GetMasterVolumeLevelScalar(out v);e.GetMute(out m);return Math.Round(v*100)+","+m.ToString().ToLower();} public static void Set(int v,bool m){var e=Endpoint();e.SetMasterVolumeLevelScalar(Math.Max(0,Math.Min(100,v))/100f,Guid.Empty);e.SetMute(m,Guid.Empty);} }
'@`;
function clamp(value:number){return Math.max(0,Math.min(100,Math.round(Number.isFinite(value)?value:0)));}
function messageOf(error:unknown){return error instanceof Error?error.message:String(error);}
async function checked(promise:Promise<Result>,label:string){const result=await promise;if(result.code!==0)throw new Error(`${label} failed: ${(result.stderr||result.stdout||`exit ${result.code}`).trim()}`);return result;}
function runCommand(command:string,args:string[],ownership?:SystemVolumeOwnership):Promise<Result>{
  return new Promise(resolve=>{
    ownership?.beginNativeWrite();
    let child:ChildProcessByStdio<null,Readable,Readable>;
    try{child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:10_000,killSignal:'SIGKILL'});}
    catch(error){let message=messageOf(error);try{ownership?.finishNativeWrite();}catch(cleanupError){message+=`; system-output command journal cleanup failed: ${messageOf(cleanupError)}`;}resolve({code:127,stdout:'',stderr:message});return;}
    let stdout='';let stderr='';let failure:string|undefined;
    child.stdout.on('data',value=>stdout+=String(value));child.stderr.on('data',value=>stderr+=String(value));
    // Spawn/kill errors do not prove the helper has closed. Keep ownership until
    // close, including when recording its PID fails after the process starts.
    child.on('error',error=>{failure=error.message;});
    child.on('close',(code,signal)=>{
      try{ownership?.finishNativeWrite();}catch(error){failure=`${failure?`${failure}; `:''}system-output command journal cleanup failed: ${messageOf(error)}`;}
      resolve({code:failure?1:code??1,stdout,stderr:failure||stderr||(signal?'The output-volume command was interrupted or timed out.':'')});
    });
    if(ownership&&child.pid)try{ownership.recordNativeWritePid(child.pid);}
    catch(error){failure=`The system-output helper PID could not be saved: ${messageOf(error)}`;try{child.kill('SIGKILL');}catch(killError){failure+=`; stopping the helper failed: ${messageOf(killError)}`;}}
  });
}
