import {afterEach, describe, expect, it, vi} from 'vitest';

// These modules must remain unevaluated for the common read-only entry points.
vi.mock('react/jsx-runtime', () => { throw new Error('Unexpected React import'); });
vi.mock('ink', () => { throw new Error('Unexpected Ink import'); });
vi.mock('./agent/cli.js', () => { throw new Error('Unexpected agent/MCP import'); });
vi.mock('./agent/headless-host.js', () => { throw new Error('Unexpected host import'); });
vi.mock('./providers/provider-manager.js', () => { throw new Error('Unexpected provider import'); });
vi.mock('./player/player-controller.js', () => { throw new Error('Unexpected player import'); });
vi.mock('./storage/store.js', () => { throw new Error('Unexpected library import'); });
vi.mock('./setup.js', () => { throw new Error('Unexpected setup import'); });
vi.mock('./cli/doctor.js', () => { throw new Error('Unexpected doctor import'); });
vi.mock('./alarms/cli.js', () => { throw new Error('Unexpected alarm import'); });
vi.mock('./update-check.js', () => { throw new Error('Unexpected updater import'); });

afterEach(() => vi.restoreAllMocks());

describe('lightweight CLI entry points', () => {
  it('loads help, version, command help and top-level completion without application subsystems', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const {runCommand} = await import('./cli.js');
    for (const args of [['help'], ['help', '--all'], ['version'], ['setup', '--help'], ['doctor', '--help'], ['mcp', '--help'], ['play', '--help'], ['search', '--help'], ['_complete', 'p']]) {
      await runCommand(args);
    }
    expect(log).toHaveBeenCalledTimes(9);
    await expect(runCommand(['doctro'])).rejects.toThrow('Did you mean radiocli doctor?');
  });
});
