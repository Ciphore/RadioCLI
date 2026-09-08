import * as fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir,userInfo} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {defaultSystemVolumeDirectory,SystemVolumeOwnership,volumeProcessAlive} from './system-volume-ownership.js';

vi.mock('node:fs',async importOriginal=>({...await importOriginal<typeof import('node:fs')>()}));

let directory:string;
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'radiocli-volume-ownership-'));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
const missingProcess=99999999;
function ownerMarker(pid=process.pid){return`owner-${pid}-${randomUUID()}`;}
function lockWith(marker:string){const lock=join(directory,'lock');mkdirSync(lock);writeFileSync(join(lock,marker),'');return lock;}
function deadProcessFixture(){vi.spyOn(process,'kill').mockImplementation(pid=>{if(pid===missingProcess)throw Object.assign(new Error('gone'),{code:'ESRCH'});return true;});}

describe('shared system-volume ownership',()=>{
  it('uses the actual OS account home across library, HOME and XDG overrides',()=>{
    const expected=join(userInfo().homedir,'.radiocli','system-volume');
    vi.stubEnv('RADIOCLI_HOME',join(directory,'profile'));vi.stubEnv('RADIO_ATLAS_HOME',join(directory,'legacy'));
    vi.stubEnv('HOME',directory);vi.stubEnv('XDG_RUNTIME_DIR',join(directory,'runtime'));vi.stubEnv('XDG_STATE_HOME',join(directory,'state'));vi.stubEnv('USERPROFILE',directory);
    expect(defaultSystemVolumeDirectory()).toBe(expected);
  });

  it('only treats ESRCH as proof that a participant is dead',()=>{
    vi.spyOn(process,'kill').mockImplementationOnce(()=>{throw Object.assign(new Error('denied'),{code:'EPERM'});}).mockImplementationOnce(()=>{throw Object.assign(new Error('unknown'),{code:'EINVAL'});}).mockImplementationOnce(()=>{throw Object.assign(new Error('gone'),{code:'ESRCH'});});
    expect(volumeProcessAlive(1)).toBe(true);expect(volumeProcessAlive(2)).toBe(true);expect(volumeProcessAlive(3)).toBe(false);
  });

  it('does not steal an old lock from a live owner',async()=>{
    const marker=ownerMarker();const lock=lockWith(marker);utimesSync(lock,new Date(0),new Date(0));
    const work=vi.fn(async()=>{});
    await expect(new SystemVolumeOwnership(directory,25).transaction(work)).rejects.toThrow(/busy.*live owner/);
    expect(work).not.toHaveBeenCalled();expect(readdirSync(lock)).toEqual([marker]);
  });

  it('recovers a dead owner and an empty directory left during cleanup',async()=>{
    deadProcessFixture();lockWith(ownerMarker(missingProcess));
    await expect(new SystemVolumeOwnership(directory,25).transaction(async()=>1)).resolves.toBe(1);
    mkdirSync(join(directory,'lock'));
    await expect(new SystemVolumeOwnership(directory,25).transaction(async()=>2)).resolves.toBe(2);
    expect(existsSync(join(directory,'lock'))).toBe(false);
  });

  it('does not displace a new live generation while reclaiming an observed dead owner',async()=>{
    deadProcessFixture();const stale=ownerMarker(missingProcess);const lock=lockWith(stale);const current=ownerMarker();
    const rename=fs.renameSync;
    vi.spyOn(fs,'renameSync').mockImplementation((source,destination)=>{
      if(String(source)===join(lock,stale)){
        fs.unlinkSync(join(lock,stale));fs.rmdirSync(lock);mkdirSync(lock);writeFileSync(join(lock,current),'');
        writeFileSync(join(directory,'native-write.json'),JSON.stringify({version:1,ownerPid:process.pid,helperPid:null}));
      }
      return rename(source,destination);
    });
    const work=vi.fn(async()=>{});
    await expect(new SystemVolumeOwnership(directory,25).transaction(work)).rejects.toThrow(/busy/);
    expect(work).not.toHaveBeenCalled();expect(readdirSync(lock)).toEqual([current]);
  });

  it('keeps an unreadable lock intact instead of allowing independent output mutations',async()=>{
    const lock=lockWith('unknown-owner');const work=vi.fn(async()=>{});
    await expect(new SystemVolumeOwnership(directory,25).transaction(work)).rejects.toThrow(/lock is unreadable/);
    expect(work).not.toHaveBeenCalled();expect(readdirSync(lock)).toEqual(['unknown-owner']);
  });

  it('returns a completed acquisition after cleanup fails and permits the next transaction to recover',async()=>{
    vi.spyOn(fs,'unlinkSync').mockImplementationOnce(()=>{throw Object.assign(new Error('cleanup denied'),{code:'EACCES'});});
    const ownership=new SystemVolumeOwnership(directory,25);
    await expect(ownership.transaction(async()=>({lease:'owned'}))).resolves.toEqual({lease:'owned'});
    await expect(ownership.transaction(async()=>2)).resolves.toBe(2);
    expect(existsSync(join(directory,'lock'))).toBe(false);
  });

  it('does not reap a dead parent while its recorded native output helper is alive',async()=>{
    deadProcessFixture();const lock=lockWith(ownerMarker(missingProcess));
    const journal=join(directory,'native-write.json');writeFileSync(journal,JSON.stringify({version:1,ownerPid:missingProcess,helperPid:process.pid}));
    const work=vi.fn(async()=>{});
    await expect(new SystemVolumeOwnership(directory,25).transaction(work)).rejects.toThrow(/helper.*running/i);
    expect(work).not.toHaveBeenCalled();expect(existsSync(lock)).toBe(true);expect(existsSync(journal)).toBe(true);
  });

  it('waits for an orphan output helper to exit before recovering its dead parent lock',async()=>{
    let helperAlive=true;const helperPid=88888888;
    vi.spyOn(process,'kill').mockImplementation(pid=>{if(pid===missingProcess||pid===helperPid&&!helperAlive)throw Object.assign(new Error('gone'),{code:'ESRCH'});return true;});
    lockWith(ownerMarker(missingProcess));const journal=join(directory,'native-write.json');writeFileSync(journal,JSON.stringify({version:1,ownerPid:missingProcess,helperPid}));
    const exited=setTimeout(()=>{helperAlive=false;},15);
    try{await new SystemVolumeOwnership(directory,100).transaction(async()=>{expect(helperAlive).toBe(false);});}
    finally{clearTimeout(exited);}
    expect(existsSync(journal)).toBe(false);
  });

  it.each([JSON.stringify({version:1,ownerPid:missingProcess,helperPid:null}),'unreadable native journal'])('retains ambiguous native work and explains safe recovery: %s',async text=>{
    const journal=join(directory,'native-write.json');writeFileSync(journal,text);
    const work=vi.fn(async()=>{});
    await expect(new SystemVolumeOwnership(directory,25).transaction(work)).rejects.toThrow(/restart.*native-write\.json/i);
    expect(work).not.toHaveBeenCalled();expect(fs.readFileSync(journal,'utf8')).toBe(text);
  });
});
