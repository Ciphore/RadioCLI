import {describe, expect, it, vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPowerInhibitor} from './inhibitor.js';

describe('power inhibitor', () => {
  it.each([
    ['darwin', 'caffeinate'], ['linux', 'systemd-inhibit'], ['win32', 'powershell.exe']
  ] as const)('uses a fixed safe command on %s', async (platform, expected) => {
    let resolveExited:()=>void=()=>{};const exited=new Promise<void>(resolve=>{resolveExited=resolve;});
    const kill = vi.fn(()=>{resolveExited();return true;});
    const spawn = vi.fn(() => ({pid: 123, kill, exited}));
    const inhibitor = createPowerInhibitor({platform, spawn, commandExists: () => true});
    const lease = await inhibitor.acquire('Alarm playback');
    expect((spawn.mock.calls as unknown as Array<[string,string[]]>)[0]?.[0]).toBe(expected);
    expect((spawn.mock.calls as unknown as Array<[string,string[]]>)[0]?.[1].join(' ')).toContain(String(process.pid));
    await lease.release();
    expect(kill).toHaveBeenCalled();
  });

  it('reports lost protection when the helper exits unexpectedly after startup',async()=>{let exit:()=>void=()=>{};const exited=new Promise<void>(resolve=>{exit=resolve;});const inhibitor=createPowerInhibitor({platform:'darwin',spawn:()=>({pid:1,kill:()=>true,exited}),commandExists:()=>true});const lease=await inhibitor.acquire('Alarm');expect(inhibitor.status().active).toBe(true);exit();await expect(lease.unexpectedExit).resolves.toMatchObject({message:expect.stringMatching(/unexpectedly/)});expect(inhibitor.status().active).toBe(false);await lease.release();});

  it('explains a missing helper without claiming that sleep is prevented',async()=>{const spawn=vi.fn();const inhibitor=createPowerInhibitor({platform:'darwin',spawn,commandExists:()=>false});expect(inhibitor.status()).toMatchObject({supported:false,active:false,message:expect.stringMatching(/caffeinate.*(?:missing|unavailable|not found)/i)});await expect(inhibitor.acquire('Alarm')).rejects.toThrow(/caffeinate.*(?:missing|unavailable|not found)/i);expect(spawn).not.toHaveBeenCalled();});

  it('does not treat a Termux process reporting Linux as a logind host',async()=>{const spawn=vi.fn();const exists=vi.fn(()=>true);const inhibitor=createPowerInhibitor({platform:'linux',env:{TERMUX_VERSION:'0.118.3'},spawn,commandExists:exists});expect(inhibitor.status()).toMatchObject({supported:false,active:false,message:expect.stringContaining('termux')});await expect(inhibitor.acquire('Alarm')).rejects.toThrow(/unsupported.*termux/i);expect(exists).not.toHaveBeenCalled();expect(spawn).not.toHaveBeenCalled();});

  it.each(['freebsd','openbsd','netbsd','android','haiku','sunos','aix'] as const)('reports unavailable sleep protection on %s without spawning a surrogate',async platform=>{const spawn=vi.fn();const inhibitor=createPowerInhibitor({platform,spawn,commandExists:()=>true});expect(inhibitor.status()).toMatchObject({supported:false,active:false});await expect(inhibitor.acquire('Alarm')).rejects.toThrow(/unsupported/i);expect(spawn).not.toHaveBeenCalled();});

  it('spawns the executable resolved from the supplied PATH',async()=>{const root=mkdtempSync(join(tmpdir(),'radiocli-inhibitor-path-'));try{const command=join(root,'systemd-inhibit');writeFileSync(command,'#!/bin/sh\nexit 0\n',{mode:0o700});let exit:()=>void=()=>{};const exited=new Promise<void>(resolve=>{exit=resolve;});const spawn=vi.fn(()=>({pid:42,kill:()=>{exit();return true;},exited}));const inhibitor=createPowerInhibitor({platform:'linux',env:{PATH:root},spawn});const lease=await inhibitor.acquire('Alarm');expect(spawn).toHaveBeenCalledWith(command,expect.any(Array));await lease.release();}finally{rmSync(root,{recursive:true,force:true});}});
});
