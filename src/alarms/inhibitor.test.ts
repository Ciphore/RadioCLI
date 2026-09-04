import {describe, expect, it, vi} from 'vitest';
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

  it('reports a helper that exits unexpectedly after startup',async()=>{let exit:()=>void=()=>{};const exited=new Promise<void>(resolve=>{exit=resolve;});const inhibitor=createPowerInhibitor({platform:'darwin',spawn:()=>({pid:1,kill:()=>true,exited}),commandExists:()=>true});const lease=await inhibitor.acquire('Alarm');exit();await expect(lease.unexpectedExit).resolves.toMatchObject({message:expect.stringMatching(/unexpectedly/)});await lease.release();});
});
