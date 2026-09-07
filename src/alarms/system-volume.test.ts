import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSystemVolumeController} from './system-volume.js';

afterEach(()=>vi.unstubAllEnvs());

describe('alarm system output volume',()=>{
  it('unmutes and raises macOS output for an alarm, then restores it',async()=>{const calls:Array<{command:string;args:string[]}>=[];const run=vi.fn(async(command:string,args:string[])=>{calls.push({command,args});return{code:0,stdout:args.includes('set s to get volume settings')?'20,true\n':'',stderr:''};});const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);expect(calls[1]?.args.join(' ')).toContain('set volume output volume 70 without output muted');await lease.release();expect(calls[2]?.args.join(' ')).toContain('set volume output volume 20 with output muted');});

  it('does not lower a device that is already louder than the alarm setting',async()=>{const run=vi.fn(async()=>({code:0,stdout:'85,false\n',stderr:''}));const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);expect(run).toHaveBeenCalledOnce();await lease.release();expect(run).toHaveBeenCalledOnce();});

  it('uses the available PipeWire output on Linux',async()=>{const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args[0]==='get-volume'?'Volume: 0.15 [MUTED]':'',stderr:''}));const controller=createSystemVolumeController('linux',run,command=>command==='wpctl'?'/usr/bin/wpctl':null);const lease=await controller.acquireMinimum(60);expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-volume','@DEFAULT_AUDIO_SINK@','60%']);expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-mute','@DEFAULT_AUDIO_SINK@','0']);await lease.release();expect(run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-mute','@DEFAULT_AUDIO_SINK@','1']);});

  it('uses Windows Core Audio through built-in PowerShell',async()=>{const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args.at(-1)?.includes('::Get')?'10,true':'',stderr:''}));const controller=createSystemVolumeController('win32',run,command=>command==='powershell.exe'?'powershell.exe':null);const lease=await controller.acquireMinimum(55);const setScript=(run.mock.calls as unknown as Array<[string,string[]]>)[1]?.[1].at(-1)??'';expect(setScript).toContain('[RadioCliVolume]::Set(55, $false)');await lease.release();});

  it('fails truthfully when no platform volume backend exists',async()=>{await expect(createSystemVolumeController('linux',vi.fn(),()=>null).acquireMinimum(50)).rejects.toThrow(/unavailable/i);});

  it('restores the previous volume and mute state when an adjustment only partly succeeds',async()=>{
    const run=vi.fn(async(_command:string,args:string[])=>({code:args[0]==='set-mute'&&args[2]==='0'?1:0,stdout:args[0]==='get-volume'?'Volume: 0.15 [MUTED]':'',stderr:args[0]==='set-mute'&&args[2]==='0'?'mute denied':''}));
    await expect(createSystemVolumeController('linux',run,()=>'/test/wpctl').acquireMinimum(60)).rejects.toThrow(/mute denied/);
    expect(run.mock.calls.map(call=>call[1])).toEqual([['get-volume','@DEFAULT_AUDIO_SINK@'],['set-volume','@DEFAULT_AUDIO_SINK@','60%'],['set-mute','@DEFAULT_AUDIO_SINK@','0'],['set-volume','@DEFAULT_AUDIO_SINK@','15%'],['set-mute','@DEFAULT_AUDIO_SINK@','1']]);
  });

  it('reports restoration failure after a partially applied adjustment',async()=>{
    const run=vi.fn(async(_command:string,args:string[])=>({code:args[0]==='set-mute'||args[2]==='15%'?1:0,stdout:args[0]==='get-volume'?'Volume: 0.15 [MUTED]':'',stderr:args[2]==='15%'?'restore denied':'mute denied'}));
    await expect(createSystemVolumeController('linux',run,()=>'/test/wpctl').acquireMinimum(60)).rejects.toThrow(/mute denied.*restor.*restore denied/i);
  });

  it('allows a failed restoration to be retried when the lease is released again',async()=>{
    let restorationAttempts=0;
    const run=vi.fn(async(_command:string,args:string[])=>{const restoring=args.some(arg=>arg.includes('set volume output volume 20 '));if(restoring)restorationAttempts+=1;return{code:restoring&&restorationAttempts===1?1:0,stdout:args.includes('set s to get volume settings')?'20,true':'',stderr:'temporary mixer failure'};});
    const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);
    await expect(lease.release()).rejects.toThrow(/temporary mixer failure/);await expect(lease.release()).resolves.toBeUndefined();await lease.release();expect(restorationAttempts).toBe(2);
  });

  it('does not control a Termux mixer through the Linux desktop adapter',async()=>{vi.stubEnv('TERMUX_VERSION','0.118.3');const run=vi.fn();const resolve=vi.fn(()=>'/test/wpctl');await expect(createSystemVolumeController('linux',run,resolve).acquireMinimum(50)).rejects.toThrow(/unavailable.*termux/i);expect(resolve).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();});

  it.each(['freebsd','openbsd','netbsd','android','haiku','sunos','aix'] as const)('reports unavailable output-volume control on %s without commands',async platform=>{const run=vi.fn();const resolve=vi.fn(()=>'/test/wpctl');await expect(createSystemVolumeController(platform,run,resolve).acquireMinimum(50)).rejects.toThrow(/unavailable/i);expect(resolve).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();});
});
