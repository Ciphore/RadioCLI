import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {hasLiveTui,registerTuiPresence} from './tui-presence.js';

describe('RadioCLI TUI presence',()=>{
  it('advertises a live TUI and removes the marker on clean exit',()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-tui-'));try{const close=registerTuiPresence(root,321);expect(hasLiveTui(root,pid=>pid===321)).toBe(true);close();expect(hasLiveTui(root,()=>true)).toBe(false);}finally{rmSync(root,{recursive:true,force:true});}});
  it('prunes markers whose process is no longer alive',()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-tui-'));try{registerTuiPresence(root,654);expect(hasLiveTui(root,()=>false)).toBe(false);expect(hasLiveTui(root,()=>true)).toBe(false);}finally{rmSync(root,{recursive:true,force:true});}});
});
