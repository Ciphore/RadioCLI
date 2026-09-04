import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export function registerTuiPresence(root=runtimeDirectory(),pid=process.pid):()=>void {
  const directory=join(root,'tui');const path=join(directory,`${pid}.json`);mkdirSync(directory,{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify({pid,startedAt:new Date().toISOString()}),{mode:0o600});
  return()=>rmSync(path,{force:true});
}
export function hasLiveTui(root=runtimeDirectory(),alive=processAlive):boolean {
  const directory=join(root,'tui');if(!existsSync(directory))return false;
  for(const name of readdirSync(directory)){const path=join(directory,name);try{const value=JSON.parse(readFileSync(path,'utf8')) as {pid?:unknown};if(typeof value.pid==='number'&&Number.isInteger(value.pid)&&alive(value.pid))return true;rmSync(path,{force:true});}catch{rmSync(path,{force:true});}}
  return false;
}
function runtimeDirectory():string{if(process.env.RADIOCLI_HOME)return join(process.env.RADIOCLI_HOME,'runtime');if(process.platform==='win32')return join(process.env.LOCALAPPDATA??join(homedir(),'AppData','Local'),'RadioCLI','runtime');return join(process.env.XDG_RUNTIME_DIR??join(homedir(),'.local','state'),'radiocli');}
function processAlive(pid:number):boolean{try{process.kill(pid,0);return true;}catch{return false;}}
