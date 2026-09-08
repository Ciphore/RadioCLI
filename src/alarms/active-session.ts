import {randomBytes} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, readFileSync,readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer, request} from 'node:http';
import {platformPaths} from '../platform/paths.js';
import {dirname, join} from 'node:path';
import type {Station} from '../types.js';
import {isLoopbackHost, listenLoopback, type LoopbackHost} from '../platform/loopback.js';

export type ActiveAlarmStatus = {
  alarmId: string;
  scheduledAt: string;
  stationName: string;
  station?: Station;
  startedAt: string;
  state?: 'starting'|'playing'|'stopping'|'failed';
  keepPlaying?: boolean;
};
type Discovery={version:1;host:LoopbackHost;port:number;token:string;pid:number;alarmId:string;createdAt?:string};
export type ActiveAlarmHandlers={filePath?:string;onDismiss():void|Promise<void>;onSnooze(minutes:number):void|Promise<void>;onKeepPlaying():void|Promise<void>;onHandoff?():void|Promise<void>};
export type ActiveAlarmServer={update(status:Partial<ActiveAlarmStatus>):void;close():Promise<void>};
export type ActiveAlarmClient={status():Promise<ActiveAlarmStatus>;dismiss():Promise<void>;snooze(minutes:number):Promise<void>;keepPlaying():Promise<void>;handoff():Promise<void>};

export async function startActiveAlarmSession(initial:ActiveAlarmStatus,handlers:ActiveAlarmHandlers):Promise<ActiveAlarmServer>{
  const filePath=handlers.filePath??defaultActiveAlarmPath(initial.alarmId,initial.scheduledAt);const token=randomBytes(32).toString('hex');let status={...initial};let terminalStarted=false;
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.headers.authorization!==`Bearer ${token}`){res.statusCode=401;res.end('{}');return;}
    try{
      if(req.method==='GET'&&req.url==='/status'){res.end(JSON.stringify(status));return;}
      if(req.method==='POST'&&req.url==='/dismiss'){if(terminalStarted)throw new Error('A terminal alarm action is already in progress.');terminalStarted=true;try{await handlers.onDismiss();}catch(error){terminalStarted=false;throw error;}res.end('{}');return;}
      if(req.method==='POST'&&req.url==='/handoff'){if(terminalStarted)throw new Error('A terminal alarm action is already in progress.');if(!handlers.onHandoff)throw new Error('Interactive playback handoff is unavailable for this alarm session.');terminalStarted=true;try{await handlers.onHandoff();}catch(error){terminalStarted=false;throw error;}res.end('{}');return;}
      if(req.method==='POST'&&req.url==='/keep-playing'){if(terminalStarted)throw new Error('The alarm is already stopping.');await handlers.onKeepPlaying();res.end('{}');return;}
      if(req.method==='POST'&&req.url==='/snooze'){if(terminalStarted)throw new Error('A terminal alarm action is already in progress.');const body=await readBody(req);const minutes=Number((JSON.parse(body) as {minutes?:unknown}).minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('Snooze must be 1–1440 minutes.');if(terminalStarted)throw new Error('A terminal alarm action is already in progress.');terminalStarted=true;try{await handlers.onSnooze(minutes);}catch(error){terminalStarted=false;throw error;}res.end('{}');return;}
      res.statusCode=404;res.end('{}');
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'request failed'}));}
  });
  const address=await listenLoopback(server);
  const discovery={version:1,host:address.host,port:address.port,token,pid:process.pid,alarmId:initial.alarmId,createdAt:new Date().toISOString()} satisfies Discovery;const temp=`${filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;try{mkdirSync(dirname(filePath),{recursive:true,mode:0o700});writeFileSync(temp,`${JSON.stringify(discovery)}\n`,{mode:0o600});renameSync(temp,filePath);if(process.platform!=='win32')chmodSync(filePath,0o600);}catch(error){rmSync(temp,{force:true});removeDiscoveryIfOwned(filePath,discovery);await new Promise<void>(resolve=>server.close(()=>resolve()));throw error;}
  return {update(change){status={...status,...change};},async close(){await new Promise<void>(resolve=>server.close(()=>resolve()));removeDiscoveryIfOwned(filePath,discovery);}};
}

export async function connectActiveAlarm(filePath?:string):Promise<ActiveAlarmClient|null>{
  if(!filePath){const clients=await connectActiveAlarms();return clients[0]??null;}
  if(!existsSync(filePath))return null;let discovery:Discovery;
  try{discovery=JSON.parse(readFileSync(filePath,'utf8')) as Discovery;if(discovery.version!==1||!isLoopbackHost(discovery.host)||!Number.isInteger(discovery.port)||!discovery.token)throw new Error('invalid');}
  catch{return null;}
  // A fresh direct agent keeps local control tokens out of environment proxies.
  // Handoff can wait for the shared output lock (30s); discovery keeps its short deadline.
  const call=async(method:string,path:string,body?:unknown)=>{const payload=body===undefined?'':JSON.stringify(body);return new Promise<unknown>((resolve,reject)=>{const req=request({host:discovery.host,agent:false,port:discovery.port,path,method,headers:{authorization:`Bearer ${discovery.token}`,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{let text='';res.on('data',value=>text+=String(value));res.on('end',()=>res.statusCode&&res.statusCode<300?resolve(text?JSON.parse(text):{}):reject(new Error('Alarm control request failed.')));});req.once('error',reject);req.setTimeout(path==='/handoff'?35_000:1000,()=>req.destroy(new Error('Alarm control request timed out.')));req.end(payload);});};
  try{await call('GET','/status');}catch{if(!processAlive(discovery.pid)||discoveryAgeMs(filePath,discovery)>5*60_000)removeDiscoveryIfOwned(filePath,discovery);return null;}
  return {status:async()=>await call('GET','/status') as ActiveAlarmStatus,dismiss:async()=>{await call('POST','/dismiss');},snooze:async minutes=>{await call('POST','/snooze',{minutes});},keepPlaying:async()=>{await call('POST','/keep-playing');},handoff:async()=>{await call('POST','/handoff');}};
}

export async function connectActiveAlarms(directory=defaultActiveAlarmDirectory()):Promise<ActiveAlarmClient[]>{if(!existsSync(directory))return[];const paths=readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>join(directory,name));const clients=await Promise.all(paths.map(path=>connectActiveAlarm(path)));return clients.filter((client):client is ActiveAlarmClient=>Boolean(client));}

function defaultActiveAlarmDirectory():string{return join(platformPaths().alarmRuntime,'active-alarms');}
function defaultActiveAlarmPath(alarmId='active',occurrenceAt='current'):string{return join(defaultActiveAlarmDirectory(),`${Buffer.from(`${alarmId}\0${occurrenceAt}`).toString('base64url')}.json`);}
function readBody(req:import('node:http').IncomingMessage):Promise<string>{return new Promise((resolve,reject)=>{let body='';req.on('data',value=>{body+=String(value);if(body.length>4096)req.destroy(new Error('Request too large.'));});req.on('end',()=>resolve(body));req.on('error',reject);});}
function removeDiscoveryIfOwned(filePath:string,owner:Discovery){let current:Partial<Discovery>;try{current=JSON.parse(readFileSync(filePath,'utf8')) as Partial<Discovery>;}catch{return;}if(!sameDiscovery(current,owner))return;const quarantine=`${filePath}.closing-${process.pid}-${randomBytes(6).toString('hex')}`;try{renameSync(filePath,quarantine);const moved=JSON.parse(readFileSync(quarantine,'utf8')) as Partial<Discovery>;if(sameDiscovery(moved,owner)){rmSync(quarantine,{force:true});return;}if(!existsSync(filePath))renameSync(quarantine,filePath);}catch{if(existsSync(quarantine)&&!existsSync(filePath))try{renameSync(quarantine,filePath);}catch{}} }
function sameDiscovery(left:Partial<Discovery>,right:Discovery){return left.version===right.version&&left.host===right.host&&left.port===right.port&&left.token===right.token&&left.pid===right.pid&&left.alarmId===right.alarmId;}
function processAlive(pid:number):boolean{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}}
function discoveryAgeMs(filePath:string,discovery:Discovery):number{const created=discovery.createdAt?Date.parse(discovery.createdAt):Number.NaN;if(Number.isFinite(created))return Math.max(0,Date.now()-created);try{return Math.max(0,Date.now()-statSync(filePath).mtimeMs);}catch{return 0;}}
