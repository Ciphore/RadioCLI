import {describe,expect,it,vi} from 'vitest';
import {createSystemVolumeController} from './system-volume.js';

describe('alarm system output volume',()=>{
  it('unmutes and raises macOS output for an alarm, then restores it',async()=>{const calls:Array<{command:string;args:string[]}>=[];const run=vi.fn(async(command:string,args:string[])=>{calls.push({command,args});return{code:0,stdout:args.includes('set s to get volume settings')?'20,true\n':'',stderr:''};});const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);expect(calls[1]?.args.join(' ')).toContain('set volume output volume 70 without output muted');await lease.release();expect(calls[2]?.args.join(' ')).toContain('set volume output volume 20 with output muted');});

  it('does not lower a device that is already louder than the alarm setting',async()=>{const run=vi.fn(async()=>({code:0,stdout:'85,false\n',stderr:''}));const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);expect(run).toHaveBeenCalledOnce();await lease.release();expect(run).toHaveBeenCalledOnce();});

  it('uses the available PipeWire output on Linux',async()=>{const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args[0]==='get-volume'?'Volume: 0.15 [MUTED]':'',stderr:''}));const controller=createSystemVolumeController('linux',run,command=>command==='wpctl'?'/usr/bin/wpctl':null);const lease=await controller.acquireMinimum(60);expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-volume','@DEFAULT_AUDIO_SINK@','60%']);expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-mute','@DEFAULT_AUDIO_SINK@','0']);await lease.release();expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-mute','@DEFAULT_AUDIO_SINK@','1']);});

  it('uses Windows Core Audio through built-in PowerShell',async()=>{const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args.at(-1)?.includes('::Get')?'10,true':'',stderr:''}));const controller=createSystemVolumeController('win32',run,command=>command==='powershell.exe'?'powershell.exe':null);const lease=await controller.acquireMinimum(55);const setScript=(run.mock.calls as unknown as Array<[string,string[]]>)[1]?.[1].at(-1)??'';expect(setScript).toContain('[RadioCliVolume]::Set(55, $false)');await lease.release();});

  it('fails truthfully when no platform volume backend exists',async()=>{await expect(createSystemVolumeController('linux',vi.fn(),()=>null).acquireMinimum(50)).rejects.toThrow(/unavailable/i);});
});
