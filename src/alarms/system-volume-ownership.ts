import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,renameSync,rmSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {userInfo} from 'node:os';
import {isAbsolute,join} from 'node:path';

export type OutputSnapshot={volume:number;muted:boolean};
export type SystemVolumeState={version:1;generation:string;baseline:OutputSnapshot|null;changed:boolean;participants:Array<{id:string;pid:number;phase:'pending'|'active'}>};

/** The output device belongs to the OS account, not a RADIOCLI_HOME/XDG profile. */
export function defaultSystemVolumeDirectory():string{
  const home=userInfo().homedir;
  if(!home||!isAbsolute(home))throw new Error('The OS account home is unavailable for shared output-volume ownership.');
  return join(home,'.radiocli','system-volume');
}

/** One short transaction covers both the saved baseline and native mixer writes. */
export class SystemVolumeOwnership{
  constructor(private readonly directory:string,private readonly timeoutMs=30_000){}

  async transaction<T>(work:()=>Promise<T>):Promise<T>{
    const release=await this.lock();
    try{return await work();}
    finally{release();}
  }

  read():SystemVolumeState|undefined{
    let text:string;
    try{text=readFileSync(join(this.directory,'state.json'),'utf8');}
    catch(error){if(codeOf(error)==='ENOENT')return undefined;throw error;}
    try{
      const value=JSON.parse(text) as SystemVolumeState;
      if(value?.version!==1||!validId(value.generation)||typeof value.changed!=='boolean'||!(value.baseline===null?!value.changed:validSnapshot(value.baseline))||!Array.isArray(value.participants)||!value.participants.every(item=>item&&validId(item.id)&&validPid(item.pid)&&(item.phase==='pending'||item.phase==='active'))||new Set(value.participants.map(item=>item.id)).size!==value.participants.length)throw new Error();
      return value;
    }catch{throw new Error('Shared output-volume ownership state is unreadable; the saved output state was left intact.');}
  }

  save(value:SystemVolumeState):void{
    const temporary=join(this.directory,`.state-${process.pid}-${randomUUID()}`);
    try{writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});renameSync(temporary,join(this.directory,'state.json'));}
    catch(error){try{rmSync(temporary,{force:true});}catch{}throw error;}
  }

  clear():void{try{unlinkSync(join(this.directory,'state.json'));}catch(error){if(codeOf(error)!=='ENOENT')throw error;}}

  /** A null PID is intentional: a crash before PID persistence is ambiguous. */
  beginNativeWrite():void{this.saveNativeWrite(null);}
  recordNativeWritePid(pid:number):void{if(!validPid(pid))throw new Error('The system-output helper did not report a valid process ID.');this.saveNativeWrite(pid);}
  finishNativeWrite():void{try{unlinkSync(join(this.directory,'native-write.json'));}catch(error){if(codeOf(error)!=='ENOENT')throw error;}}

  private saveNativeWrite(helperPid:number|null):void{
    const temporary=join(this.directory,`.native-write-${process.pid}-${randomUUID()}`);
    try{writeFileSync(temporary,JSON.stringify({version:1,ownerPid:process.pid,helperPid}),{mode:0o600,flag:'wx'});renameSync(temporary,join(this.directory,'native-write.json'));}
    catch(error){try{rmSync(temporary,{force:true});}catch{}throw error;}
  }

  private nativeWriteSettled():boolean{
    const path=join(this.directory,'native-write.json');let value:{version?:number;ownerPid?:number;helperPid?:number|null};
    try{value=JSON.parse(readFileSync(path,'utf8')) as typeof value;}
    catch(error){if(codeOf(error)==='ENOENT')return true;throw this.unknownNativeWrite(path);}
    if(value?.version!==1||!validPid(value.ownerPid)||!validPid(value.helperPid))throw this.unknownNativeWrite(path);
    if(volumeProcessAlive(value.helperPid))return false;
    // Removal is only allowed after acquiring the lock, so an old observer
    // cannot remove a newer owner's journal.
    this.finishNativeWrite();return true;
  }

  private unknownNativeWrite(path:string):Error{return new Error(`An interrupted system-output helper could not be identified; the saved volume was retained. Restart the computer, then remove ${path} before retrying system output control.`);}
  private async waitForNativeWrite(deadline:number):Promise<void>{while(!this.nativeWriteSettled()){if(Date.now()>=deadline)throw new Error('A system-output helper is still running; the saved volume will be recovered after it exits.');await pause();}}

  private async lock():Promise<()=>void>{
    mkdirSync(this.directory,{recursive:true,mode:0o700});
    const marker=`owner-${process.pid}-${randomUUID()}`;
    const candidate=join(this.directory,`.lock-${marker}`);const lock=join(this.directory,'lock');
    mkdirSync(candidate,{mode:0o700});
    let published=false;
    try{
      writeFileSync(join(candidate,marker),'',{mode:0o600,flag:'wx'});
      const deadline=Date.now()+this.timeoutMs;
      while(true){
        let acquired=false;
        try{renameSync(candidate,lock);published=true;acquired=true;}
        catch(error){if(!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(codeOf(error)??''))throw error;}
        if(acquired){try{await this.waitForNativeWrite(deadline);}catch(error){finishLock(lock,marker);throw error;}return()=>finishLock(lock,marker);}
        if(Date.now()>=deadline)throw new Error('Shared output-volume ownership is busy; its live owner was left intact.');
        let owners:string[];
        try{owners=readdirSync(lock);}catch(error){if(codeOf(error)==='ENOENT'){await pause();continue;}throw error;}
        if(owners.length===0){removeEmptyLock(lock);continue;}
        const owner=owners[0]!;const match=/^(owner|released)-([1-9]\d*)-([a-f\d-]{36})$/.exec(owner);
        if(owners.length!==1||!match||!validPid(Number(match[2]))||!validId(match[3]))throw new Error('Shared output-volume ownership lock is unreadable; it was left intact.');
        if(match[1]==='released'||!volumeProcessAlive(Number(match[2]))){
          // Claim this exact dead generation, never rename/remove a replacement
          // lock directory. A reaper that dies is recovered by the same protocol.
          const reaper=`owner-${process.pid}-${randomUUID()}`;
          try{renameSync(join(lock,owner),join(lock,reaper));}
          catch(error){if(codeOf(error)==='ENOENT')continue;throw error;}
          try{await this.waitForNativeWrite(deadline);}
          catch(error){try{renameSync(join(lock,reaper),join(lock,owner));}catch{finishLock(lock,reaper);}throw error;}
          finishLock(lock,reaper);await pause();continue;
        }
        await pause();
      }
    }finally{if(!published)try{rmSync(candidate,{recursive:true,force:true});}catch{}}
  }
}

export function volumeProcessAlive(pid:number):boolean{
  try{process.kill(pid,0);return true;}catch(error){return codeOf(error)!=='ESRCH';}
}
function finishLock(directory:string,marker:string):void{
  const released=`released-${process.pid}-${randomUUID()}`;
  try{renameSync(join(directory,marker),join(directory,released));}
  catch{try{removeOwnedLock(directory,marker);}catch{}return;}
  // Do not lose a returned lease or replace a mixer failure with cleanup errors.
  // A published completion can be reclaimed even while this PID remains alive.
  try{removeOwnedLock(directory,released);}catch{}
}
function removeOwnedLock(directory:string,marker:string):void{
  try{unlinkSync(join(directory,marker));}catch(error){if(codeOf(error)==='ENOENT')return;throw error;}
  removeEmptyLock(directory);
}
function removeEmptyLock(directory:string):void{
  // Another process may already have published a new nonempty generation.
  try{rmdirSync(directory);}catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(codeOf(error)??''))throw error;}
}
function validPid(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>0;}
function validId(value:unknown):value is string{return typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(value);}
function validSnapshot(value:unknown):value is OutputSnapshot{if(!value||typeof value!=='object')return false;const state=value as OutputSnapshot;return Number.isInteger(state.volume)&&state.volume>=0&&state.volume<=100&&typeof state.muted==='boolean';}
function codeOf(error:unknown):string|undefined{return(error as NodeJS.ErrnoException)?.code;}
function pause():Promise<void>{return new Promise(resolve=>setTimeout(resolve,20));}
