import {performance} from 'node:perf_hooks';
import {buildBoatLake} from '../../src/ui/visualizers/boat-lake.js';
import * as lake from './reference.mjs';
import * as draw from './reference.mjs';
const layout={...draw.m89369_m(160,42,22),full:true,copyW:0,fade:0};
const fleet=draw.m89369_V(layout);
function reference(pulse,width,height){
 const light=lake.m59908_z(layout,.44,pulse*.08),cells=new Int8Array(width*height*3);
 const field=(x,y)=>{x*=layout.W/(width*8);y*=layout.H/(height*16);let v=lake.m59908_h(layout,light,x,y);if(v>=0)return v;if(y>=layout.hz)return lake.m59908_P(layout,light,fleet,x,y);v=lake.m59908_I(layout,light,x,y);return v>=0?v:lake.m59908_d(layout,light,x,y)};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)lake.m59908_G(field,x,y,cells,(y*width+x)*3,true);
 return cells;
}
function measure(fn,width,height){for(let i=0;i<60;i++)fn(i,width,height);const times=[];for(let i=0;i<200;i++){const start=performance.now();fn(i+60,width,height);times.push(performance.now()-start)}times.sort((a,b)=>a-b);return{medianMs:+times[100].toFixed(3),p95Ms:+times[190].toFixed(3)}}
const results=[];for(const [width,height]of [[120,30],[120,18],[100,14],[80,10],[60,7],[36,4],[24,4],[20,3]]){const original=measure(reference,width,height),optimized=measure((p,w,h)=>buildBoatLake(p,w,h,'blue'),width,height);results.push({viewport:`${width}x${height}`,original,optimized,speedup:+(original.medianMs/optimized.medianMs).toFixed(2)})}console.log(JSON.stringify({runtime:process.version,results},null,2));
