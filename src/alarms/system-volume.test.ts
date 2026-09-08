import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as fs from 'node:fs';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSystemVolumeController as createController} from './system-volume.js';

vi.mock('node:fs',async importOriginal=>({...await importOriginal<typeof import('node:fs')>()}));

let directory:string;
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'radiocli-volume-'));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
function createSystemVolumeController(...args:Parameters<typeof createController>){return createController(args[0],args[1],args[2],{directory});}

function fakeOutput(volume=20,muted=true){
  let state={volume,muted};const writes:Array<typeof state>=[];
  const run=vi.fn(async(_command:string,args:string[])=>{
    if(args.includes('set s to get volume settings'))return{code:0,stdout:`${state.volume},${state.muted}`,stderr:''};
    const match=/set volume output volume (\d+) (with|without) output muted/.exec(args.join(' '));
    if(!match)throw new Error('Unexpected fake mixer command');
    state={volume:Number(match[1]),muted:match[2]==='with'};writes.push({...state});
    return{code:0,stdout:'',stderr:''};
  });
  return{run,writes,state:()=>({...state})};
}

describe('alarm system output volume',()=>{
  it.each([false,true])('keeps overlapping alarms audible and restores the shared baseline (reverse release: %s)',async reverse=>{
    const output=fakeOutput();
    const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(40);
    const second=await createSystemVolumeController('darwin',output.run).acquireMinimum(70);
    await (reverse?second:first).release();
    expect(output.state()).toEqual({volume:70,muted:false});
    await (reverse?first:second).release();
    expect(output.state()).toEqual({volume:20,muted:true});
    expect(output.writes).toEqual([{volume:40,muted:false},{volume:70,muted:false},{volume:20,muted:true}]);
  });

  it('joins an already-loud output lease so another alarm cannot restore underneath it',async()=>{
    const output=fakeOutput();
    const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(70);
    const second=await createSystemVolumeController('darwin',output.run).acquireMinimum(40);
    await first.release();expect(output.state()).toEqual({volume:70,muted:false});
    await second.release();expect(output.state()).toEqual({volume:20,muted:true});
  });

  it('serializes concurrent acquisitions and duplicate releases',async()=>{
    const output=fakeOutput();
    const [first,second]=await Promise.all([createSystemVolumeController('darwin',output.run).acquireMinimum(40),createSystemVolumeController('darwin',output.run).acquireMinimum(70)]);
    await Promise.all([first.release(),first.release(),second.release(),second.release()]);
    expect(output.state()).toEqual({volume:20,muted:true});
    expect(output.writes.filter(state=>state.muted)).toHaveLength(1);
  });

  it('preserves handed-off output after remaining alarms end and rebases later raises',async()=>{
    const output=fakeOutput();
    const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(40);
    const second=await createSystemVolumeController('darwin',output.run).acquireMinimum(70);
    await first.release({preserve:true});
    const third=await createSystemVolumeController('darwin',output.run).acquireMinimum(90);
    await second.release();expect(output.state()).toEqual({volume:90,muted:false});
    await third.release();expect(output.state()).toEqual({volume:70,muted:false});
    const fourth=await createSystemVolumeController('darwin',output.run).acquireMinimum(80);
    await fourth.release();expect(output.state()).toEqual({volume:70,muted:false});
  });

  it('rolls a failed overlapping adjustment back to the active alarm output',async()=>{
    const output=fakeOutput();
    const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(40);
    const failRaise=async(command:string,args:string[])=>{const result=await output.run(command,args);return args.join(' ').includes('output volume 70 ')?{...result,code:1,stderr:'partial adjustment'}:result;};
    await expect(createSystemVolumeController('darwin',failRaise).acquireMinimum(70)).rejects.toThrow('partial adjustment');
    expect(output.state()).toEqual({volume:40,muted:false});
    await first.release();expect(output.state()).toEqual({volume:20,muted:true});
  });

  it('retains the original baseline after both an adjustment and its rollback fail',async()=>{
    const output=fakeOutput();
    const failWrites=async(command:string,args:string[])=>{const result=await output.run(command,args);return args.includes('set s to get volume settings')?result:{...result,code:1,stderr:'mixer failed'};};
    await expect(createSystemVolumeController('darwin',failWrites).acquireMinimum(70)).rejects.toThrow(/restoring.*failed/);
    expect(existsSync(join(directory,'state.json'))).toBe(true);
    const next=await createSystemVolumeController('darwin',output.run).acquireMinimum(80);
    await next.release();expect(output.state()).toEqual({volume:20,muted:true});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
  });

  it('recovers a failed final restoration before taking a later alarm baseline',async()=>{
    const output=fakeOutput();let failRestore=true;
    const run=async(command:string,args:string[])=>{if(failRestore&&args.join(' ').includes('output volume 20 '))return{code:1,stdout:'',stderr:'restore failed'};return output.run(command,args);};
    const first=await createSystemVolumeController('darwin',run).acquireMinimum(70);
    await expect(first.release()).rejects.toThrow('restore failed');
    expect(output.state()).toEqual({volume:70,muted:false});
    failRestore=false;
    const second=await createSystemVolumeController('darwin',run).acquireMinimum(80);
    await first.release();expect(output.state()).toEqual({volume:80,muted:false});
    await second.release();expect(output.state()).toEqual({volume:20,muted:true});
  });

  it('allows concurrent release retries after a failed final restoration',async()=>{
    const output=fakeOutput();let attempts=0;
    const run=async(command:string,args:string[])=>{if(args.join(' ').includes('output volume 20 ')&&++attempts===1)return{code:1,stdout:'',stderr:'retry restore'};return output.run(command,args);};
    const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);
    const results=await Promise.allSettled([lease.release(),lease.release(),lease.release()]);
    expect(results.map(result=>result.status).sort()).toEqual(['fulfilled','fulfilled','rejected']);
    expect(output.state()).toEqual({volume:20,muted:true});expect(attempts).toBe(2);
  });

  it('does not touch the mixer when saved ownership is corrupt',async()=>{
    const text='{"version":77,"baseline":"unknown"}';writeFileSync(join(directory,'state.json'),text);
    const output=fakeOutput();await expect(createSystemVolumeController('darwin',output.run).acquireMinimum(70)).rejects.toThrow(/ownership state is unreadable/);
    expect(output.run).not.toHaveBeenCalled();expect(readFileSync(join(directory,'state.json'),'utf8')).toBe(text);
  });

  it('does not raise output if the original state cannot be saved',async()=>{
    const output=fakeOutput();
    const run=async(command:string,args:string[])=>{const result=await output.run(command,args);if(args.includes('set s to get volume settings'))mkdirSync(join(directory,'state.json'));return result;};
    await expect(createSystemVolumeController('darwin',run).acquireMinimum(70)).rejects.toThrow();
    expect(output.writes).toEqual([]);expect(output.state()).toEqual({volume:20,muted:true});
  });

  it('does not leave a live phantom participant when adjustment, rollback and recovery persistence all fail',async()=>{
    const output=fakeOutput();const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(40);
    let saves=0;const rename=fs.renameSync;
    vi.spyOn(fs,'renameSync').mockImplementation((source,destination)=>{if(String(destination)===join(directory,'state.json')&&++saves===2)throw new Error('recovery disk failure');return rename(source,destination);});
    const failWrites=async(command:string,args:string[])=>{const result=await output.run(command,args);return args.includes('set s to get volume settings')?result:{...result,code:1,stderr:'mixer failure'};};
    await expect(createSystemVolumeController('darwin',failWrites).acquireMinimum(70)).rejects.toThrow(/mixer failure.*restoring.*mixer failure.*recovery disk failure/);
    await first.release();expect(output.state()).toEqual({volume:20,muted:true});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
  });

  it('recovers an unreturned lease while its process lives when rollback succeeds but cleanup persistence fails',async()=>{
    const output=fakeOutput();const unlink=fs.unlinkSync;let failed=false;
    vi.spyOn(fs,'unlinkSync').mockImplementation(path=>{if(String(path)===join(directory,'state.json')&&!failed){failed=true;throw new Error('recovery cleanup failure');}return unlink(path);});
    const failRaise=async(command:string,args:string[])=>{const result=await output.run(command,args);return args.join(' ').includes('output volume 70 ')?{...result,code:1,stderr:'raise failed'}:result;};
    await expect(createSystemVolumeController('darwin',failRaise).acquireMinimum(70)).rejects.toThrow(/raise failed.*recovery cleanup failure/);
    const next=await createSystemVolumeController('darwin',output.run).acquireMinimum(80);
    await next.release();expect(output.state()).toEqual({volume:20,muted:true});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
  });

  it.each([40,80])('rolls back an acquisition whose active ownership commit fails (target: %s)',async target=>{
    const output=fakeOutput();const first=await createSystemVolumeController('darwin',output.run).acquireMinimum(70);
    let saves=0;const rename=fs.renameSync;
    vi.spyOn(fs,'renameSync').mockImplementation((source,destination)=>{if(String(destination)===join(directory,'state.json')&&++saves===2)throw new Error('ownership commit failed');return rename(source,destination);});
    await expect(createSystemVolumeController('darwin',output.run).acquireMinimum(target)).rejects.toThrow('ownership commit failed');
    expect(output.state()).toEqual({volume:70,muted:false});
    await first.release();expect(output.state()).toEqual({volume:20,muted:true});
  });

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
