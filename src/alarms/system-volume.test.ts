import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as fs from 'node:fs';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
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

function linuxOutput(command:'wpctl'|'pactl'='wpctl',pipewirePulse=false){
  const outputs=new Map([
    ['42',{name:'speakers',serial:'142',volume:20,muted:true}],
    ['43',{name:'headphones',serial:'143',volume:85,muted:false}]
  ]);
  let selected='42';let server='123456';
  const writes:Array<{id:string;action:string;value:string}>=[];
  const run=vi.fn(async(executable:string,args:string[])=>{
    const ok=(stdout='')=>({code:0,stdout,stderr:''});
    if(args[0]==='status')return ok(`PipeWire 'pipewire-0' [1.4.7, test@host, cookie:${server}]`);
    if(args[0]==='info'){const cookie=Number(server).toString(16).padStart(8,'0');return ok(`Server String: /run/user/1000/pulse/native\nServer Name: ${pipewirePulse?'PulseAudio (on PipeWire 1.4.9)':'pulseaudio'}\nDefault Sink: ${outputs.get(selected)?.name}\nCookie: ${pipewirePulse?`${cookie.slice(0,4)}:${cookie.slice(4)}`:server}`);}
    if(args[0]==='list')return ok([...outputs].map(([id,value])=>args[1]==='short'?`${id}\t${value.name}\tPipeWire\tfloat32le 2ch 48000Hz\tIDLE`:`Sink #${value.serial}\n\tName: ${value.name}\n\tProperties:\n\t\tobject.id = "${id}"\n\t\tobject.serial = "${value.serial}"\n\t\tnode.name = "${value.name}"\n`).join('\n'));
    const id=args[1]==='@DEFAULT_AUDIO_SINK@'?selected:pipewirePulse&&executable.endsWith('/pactl')?[...outputs].find(([,value])=>value.serial===args[1])?.[0]??'missing':args[1]!;const output=outputs.get(id);
    if(!output)return{code:3,stdout:'',stderr:'Object not found'};
    if(args[0]==='inspect')return ok(`id ${id}, type PipeWire:Interface:Node\n  * object.serial = "${output.serial}"\n  * node.name = "${output.name}"\n  * media.class = "Audio/Sink"\n`);
    if(args[0]==='get-volume')return ok(`Volume: ${(output.volume/100).toFixed(2)}${output.muted?' [MUTED]':''}`);
    if(args[0]==='get-sink-volume')return ok(`Volume: front-left: 1000 / ${output.volume}% / -10 dB`);
    if(args[0]==='get-sink-mute')return ok(`Mute: ${output.muted?'yes':'no'}`);
    if(args[0]==='set-volume'||args[0]==='set-sink-volume')output.volume=Number.parseInt(args[2]!);
    else if(args[0]==='set-mute'||args[0]==='set-sink-mute')output.muted=args[2]==='1';
    else throw new Error(`Unexpected fake Linux mixer command: ${args.join(' ')}`);
    writes.push({id,action:args[0]!,value:args[2]!});return ok();
  });
  const controller=(execute:Parameters<typeof createController>[1]=run,backend=command)=>createSystemVolumeController('linux',execute,name=>name===backend?`/usr/bin/${backend}`:null);
  return{outputs,writes,run,controller,select:(id:string)=>{selected=id;},restart:()=>{server='654321';}};
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

  it('uses the identified PipeWire output on Linux',async()=>{
    const output=linuxOutput();const lease=await output.controller().acquireMinimum(60);
    expect(output.run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-volume','42','60%']);
    expect(output.run).toHaveBeenCalledWith('/usr/bin/wpctl',['set-mute','42','0']);
    await lease.release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
  });

  it('uses Windows Core Audio through built-in PowerShell',async()=>{const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args.at(-1)?.includes('::Get')?'10,true':'',stderr:''}));const controller=createSystemVolumeController('win32',run,command=>command==='powershell.exe'?'powershell.exe':null);const lease=await controller.acquireMinimum(55);const setScript=(run.mock.calls as unknown as Array<[string,string[]]>)[1]?.[1].at(-1)??'';expect(setScript).toContain('[RadioCliVolume]::Set(55, $false)');await lease.release();});

  it('fails truthfully when no platform volume backend exists',async()=>{await expect(createSystemVolumeController('linux',vi.fn(),()=>null).acquireMinimum(50)).rejects.toThrow(/unavailable/i);});

  it('restores the previous volume and mute state when an adjustment only partly succeeds',async()=>{
    const output=linuxOutput();
    const run=async(command:string,args:string[])=>{const result=await output.run(command,args);return args[0]==='set-mute'&&args[2]==='0'?{...result,code:1,stderr:'mute denied'}:result;};
    await expect(output.controller(run).acquireMinimum(60)).rejects.toThrow(/mute denied/);
    expect(output.writes).toEqual([{id:'42',action:'set-volume',value:'60%'},{id:'42',action:'set-mute',value:'0'},{id:'42',action:'set-volume',value:'20%'},{id:'42',action:'set-mute',value:'1'}]);
    expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
  });

  it('reports restoration failure after a partially applied adjustment',async()=>{
    const output=linuxOutput();
    const run=async(command:string,args:string[])=>{const result=await output.run(command,args);return args[0]==='set-mute'||args[2]==='20%'?{...result,code:1,stderr:args[2]==='20%'?'restore denied':'mute denied'}:result;};
    await expect(output.controller(run).acquireMinimum(60)).rejects.toThrow(/mute denied.*restor.*restore denied/i);
  });

  it('allows a failed restoration to be retried when the lease is released again',async()=>{
    let restorationAttempts=0;
    const run=vi.fn(async(_command:string,args:string[])=>{const restoring=args.some(arg=>arg.includes('set volume output volume 20 '));if(restoring)restorationAttempts+=1;return{code:restoring&&restorationAttempts===1?1:0,stdout:args.includes('set s to get volume settings')?'20,true':'',stderr:'temporary mixer failure'};});
    const lease=await createSystemVolumeController('darwin',run).acquireMinimum(70);
    await expect(lease.release()).rejects.toThrow(/temporary mixer failure/);await expect(lease.release()).resolves.toBeUndefined();await lease.release();expect(restorationAttempts).toBe(2);
  });

  it('does not control a Termux mixer through the Linux desktop adapter',async()=>{vi.stubEnv('TERMUX_VERSION','0.118.3');const run=vi.fn();const resolve=vi.fn(()=>'/test/wpctl');await expect(createSystemVolumeController('linux',run,resolve).acquireMinimum(50)).rejects.toThrow(/unavailable.*termux/i);expect(resolve).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();});

  it.each(['wpctl','pactl'] as const)('keeps %s leases independent across default switches and same-output overlaps',async command=>{
    const output=linuxOutput(command);
    const speakers=await output.controller().acquireMinimum(70);
    output.select('43');const headphones=await output.controller().acquireMinimum(95);
    output.select('42');const speakersAgain=await output.controller().acquireMinimum(80);
    output.select('43');await speakers.release();
    expect(output.outputs.get('42')).toMatchObject({volume:80,muted:false});
    expect(output.outputs.get('43')).toMatchObject({volume:95,muted:false});
    await speakersAgain.release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
    expect(output.outputs.get('43')).toMatchObject({volume:95,muted:false});
    await headphones.release();expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
    expect(output.writes.every(item=>/^\d+$/.test(item.id))).toBe(true);
  });

  it.each([
    ['wpctl','pactl',false],['wpctl','pactl',true],
    ['pactl','wpctl',false],['pactl','wpctl',true]
  ] as const)('shares one PipeWire baseline across %s and %s (reverse release: %s)',async(firstBackend,secondBackend,reverse)=>{
    const output=linuxOutput('wpctl',true);
    const first=await output.controller(output.run,firstBackend).acquireMinimum(70);
    const second=await output.controller(output.run,secondBackend).acquireMinimum(95);
    const saved=JSON.parse(readFileSync(join(directory,'state.json'),'utf8'));
    expect(saved.outputs).toHaveLength(1);expect(saved.outputs[0].lease.participants).toHaveLength(2);
    await (reverse?second:first).release();expect(output.outputs.get('42')).toMatchObject({volume:95,muted:false});
    await (reverse?first:second).release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
  });

  it.each([['wpctl','pactl'],['pactl','wpctl']] as const)('recovers a crashed %s owner through %s on the same and another PipeWire output',async(firstBackend,secondBackend)=>{
    const output=linuxOutput('wpctl',true);const path=join(directory,'state.json');
    vi.spyOn(process,'kill').mockImplementation(pid=>{if(pid===99999999)throw Object.assign(new Error('gone'),{code:'ESRCH'});return true;});
    for(const next of ['42','43']){
      output.select('42');await output.controller(output.run,firstBackend).acquireMinimum(70);
      const saved=JSON.parse(readFileSync(path,'utf8'));saved.outputs[0].lease.participants[0].pid=99999999;writeFileSync(path,JSON.stringify(saved));
      output.select(next);const recovered=await output.controller(output.run,secondBackend).acquireMinimum(95);
      if(next==='43')expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
      await recovered.release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
      expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
      expect(existsSync(path)).toBe(false);
    }
  });

  it('keeps classic PulseAudio separate even when a sink name and numeric cookie resemble PipeWire',async()=>{
    const pipewire=linuxOutput();const pulse=linuxOutput('pactl');
    pipewire.outputs.get('42')!.serial='42';
    const first=await pipewire.controller().acquireMinimum(70);const second=await pulse.controller().acquireMinimum(95);
    expect(JSON.parse(readFileSync(join(directory,'state.json'),'utf8')).outputs).toHaveLength(2);
    await first.release();expect(pipewire.outputs.get('42')).toMatchObject({volume:20,muted:true});
    expect(pulse.outputs.get('42')).toMatchObject({volume:95,muted:false});await second.release();
    expect(pulse.outputs.get('42')).toMatchObject({volume:20,muted:true});
  });

  it.each(['object.id','object.serial','node.name'])('refuses unverifiable Pulse-on-PipeWire %s metadata without mixer writes',async property=>{
    const output=linuxOutput('pactl',true);
    const run=async(command:string,args:string[])=>{const result=await output.run(command,args);return args[0]==='list'?{...result,stdout:result.stdout.split('\n').filter(line=>!line.includes(property)).join('\n')}:result;};
    await expect(output.controller(run).acquireMinimum(70)).rejects.toThrow(/unreadable PipeWire output identity/);
    expect(output.writes).toEqual([]);
  });

  it.each(['wpctl','pactl'] as const)('preserves only the handed-off %s output while restoring another output',async command=>{
    const output=linuxOutput(command);const speakers=await output.controller().acquireMinimum(70);
    output.select('43');const headphones=await output.controller().acquireMinimum(95);
    await speakers.release({preserve:true});await headphones.release();
    expect(output.outputs.get('42')).toMatchObject({volume:70,muted:false});
    expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
  });

  it('restores a retained PulseAudio sink even if the server has no current default',async()=>{
    const output=linuxOutput('pactl');const lease=await output.controller().acquireMinimum(70);
    output.select('unavailable');await lease.release();
    expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
  });

  it.each(['wpctl','pactl'] as const)('leaves another %s lease intact after a partial acquisition and rollback failure',async command=>{
    const output=linuxOutput(command);const speakers=await output.controller().acquireMinimum(70);
    output.select('43');
    const run=async(executable:string,args:string[])=>{const result=await output.run(executable,args);return args[0]?.startsWith('set-')?{...result,code:1,stderr:'partial write'}:result;};
    await expect(output.controller(run).acquireMinimum(95)).rejects.toThrow(/restoring.*failed/);
    await speakers.release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
    const recovered=await output.controller().acquireMinimum(96);await recovered.release();
    expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
    expect(existsSync(join(directory,'state.json'))).toBe(false);
  });

  it.each(['wpctl','pactl'] as const)('recovers a dead %s owner on its original output without lowering a different active output',async command=>{
    const output=linuxOutput(command);await output.controller().acquireMinimum(70);
    const path=join(directory,'state.json');const saved=JSON.parse(readFileSync(path,'utf8'));
    saved.outputs[0].lease.participants[0].pid=99999999;writeFileSync(path,JSON.stringify(saved));
    vi.spyOn(process,'kill').mockImplementation(pid=>{if(pid===99999999)throw Object.assign(new Error('gone'),{code:'ESRCH'});return true;});
    output.select('43');const headphones=await output.controller().acquireMinimum(95);
    expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
    output.select('42');const recovered=await output.controller().acquireMinimum(80);
    expect(output.outputs.get('43')).toMatchObject({volume:95,muted:false});
    await recovered.release();expect(output.outputs.get('42')).toMatchObject({volume:20,muted:true});
    await headphones.release();expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
  });

  it.each(['wpctl','pactl'] as const)('retains failed %s recovery when the original output disappears and allows a separate output lease',async command=>{
    const output=linuxOutput(command);const speakers=await output.controller().acquireMinimum(70);
    output.outputs.delete('42');output.select('43');const before=output.writes.length;
    await expect(speakers.release()).rejects.toThrow(/not found|identity changed/i);
    expect(output.writes).toHaveLength(before);
    const retained=JSON.parse(readFileSync(join(directory,'state.json'),'utf8')).outputs[0];
    expect(retained.lease.baseline).toEqual({volume:20,muted:true});
    const headphones=await output.controller().acquireMinimum(95);expect(headphones.message).toContain('recovery record remains unresolved and retained');await headphones.release();
    expect(output.outputs.get('43')).toMatchObject({volume:85,muted:false});
    expect(JSON.parse(readFileSync(join(directory,'state.json'),'utf8')).outputs).toEqual([retained]);
  });

  it.each(['wpctl','pactl'] as const)('does not restore a %s baseline onto a reused device index or restarted server',async command=>{
    const output=linuxOutput(command);const lease=await output.controller().acquireMinimum(70);
    const original={...output.outputs.get('42')!};const before=output.writes.length;
    output.outputs.set('42',{...original,name:'replacement',serial:'999',volume:90,muted:false});
    await expect(lease.release()).rejects.toThrow(/identity changed/);expect(output.writes).toHaveLength(before);
    output.outputs.set('42',original);output.restart();
    await expect(lease.release()).rejects.toThrow(/identity changed/);expect(output.writes).toHaveLength(before);
    expect(existsSync(join(directory,'state.json'))).toBe(true);
  });

  it('checks PipeWire object serial even when a reused ID has the same node name',async()=>{
    const output=linuxOutput();const lease=await output.controller().acquireMinimum(70);
    output.outputs.get('42')!.serial='999';const before=output.writes.length;
    await expect(lease.release()).rejects.toThrow(/identity changed/);expect(output.writes).toHaveLength(before);
  });

  it.each(['wpctl','pactl'] as const)('guards the second %s write when output identity changes after setting volume',async command=>{
    const output=linuxOutput(command);
    const run=async(executable:string,args:string[])=>{
      const result=await output.run(executable,args);
      if(args[0]==='set-volume'||args[0]==='set-sink-volume')output.outputs.set('42',{name:'replacement',serial:'999',volume:90,muted:true});
      return result;
    };
    await expect(output.controller(run).acquireMinimum(70)).rejects.toThrow(/identity changed.*restoring.*identity changed/);
    expect(output.writes).toHaveLength(1);expect(output.outputs.get('42')).toMatchObject({volume:90,muted:true});
    expect(JSON.parse(readFileSync(join(directory,'state.json'),'utf8')).outputs[0].lease.baseline).toEqual({volume:20,muted:true});
  });

  it.each(['wpctl','pactl'] as const)('preserves unidentified legacy %s recovery and the original native-helper barrier',async command=>{
    const output=linuxOutput(command);const state=JSON.stringify({version:1,generation:randomUUID(),baseline:{volume:20,muted:true},changed:true,participants:[]});
    writeFileSync(join(directory,'state.json'),state);
    const journal=JSON.stringify({version:1,ownerPid:99999999,helperPid:null});writeFileSync(join(directory,'native-write.json'),journal);
    await expect(output.controller().acquireMinimum(70)).rejects.toThrow(/helper could not be identified/);
    expect(readFileSync(join(directory,'native-write.json'),'utf8')).toBe(journal);
    rmSync(join(directory,'native-write.json'));
    await expect(output.controller().acquireMinimum(70)).rejects.toThrow(/without a device identity/);
    expect(readFileSync(join(directory,'state.json'),'utf8')).toBe(state);expect(output.writes).toEqual([]);
  });

  it('migrates a completed, unchanged legacy record without discarding a live old lease',async()=>{
    const output=linuxOutput();const path=join(directory,'state.json');
    const state={version:1,generation:randomUUID(),baseline:{volume:20,muted:true},changed:false,participants:[{id:randomUUID(),pid:process.pid,phase:'active'}]};
    writeFileSync(path,JSON.stringify(state));await expect(output.controller().acquireMinimum(70)).rejects.toThrow(/without a device identity/);
    state.participants=[];writeFileSync(path,JSON.stringify(state));const lease=await output.controller().acquireMinimum(70);
    expect(JSON.parse(readFileSync(path,'utf8')).version).toBe(2);await lease.release();
  });

  it.each(['identity','duplicate','baseline','participant'])('retains corrupt multi-output %s state without mixer writes',async damage=>{
    const output=linuxOutput();await output.controller().acquireMinimum(70);
    const path=join(directory,'state.json');const saved=JSON.parse(readFileSync(path,'utf8'));
    if(damage==='identity')delete saved.outputs[0].identity.serial;
    if(damage==='duplicate')saved.outputs.push(saved.outputs[0]);
    if(damage==='baseline')saved.outputs[0].lease.baseline.volume=200;
    if(damage==='participant')saved.outputs[0].lease.participants[0].pid=-1;
    const text=JSON.stringify(saved);writeFileSync(path,text);const writes=output.writes.length;
    await expect(output.controller().acquireMinimum(80)).rejects.toThrow(/ownership state is unreadable/);
    expect(output.writes).toHaveLength(writes);expect(readFileSync(path,'utf8')).toBe(text);
  });

  it('keeps ALSA output controls and restoration unchanged',async()=>{
    const run=vi.fn(async(_command:string,args:string[])=>({code:0,stdout:args[0]==='get'?'Mono: Playback 20 [20%] [off]':'',stderr:''}));
    const lease=await createSystemVolumeController('linux',run,name=>name==='amixer'?'/usr/bin/amixer':null).acquireMinimum(60);await lease.release();
    expect(run.mock.calls.map(call=>call[1])).toEqual([['get','Master'],['set','Master','60%','unmute'],['set','Master','20%','mute']]);
  });

  it.each(['freebsd','openbsd','netbsd','android','haiku','sunos','aix'] as const)('reports unavailable output-volume control on %s without commands',async platform=>{const run=vi.fn();const resolve=vi.fn(()=>'/test/wpctl');await expect(createSystemVolumeController(platform,run,resolve).acquireMinimum(50)).rejects.toThrow(/unavailable/i);expect(resolve).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();});
});
