import {existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isDirectRun, runCommand} from './cli.js';

const roots: string[] = [];
const originalRadioCliHome = process.env.RADIOCLI_HOME;
const originalRadioAtlasHome = process.env.RADIO_ATLAS_HOME;
let radioCliHome = '';
let logs: string[] = [];

describe('CLI command dispatch', () => {
  beforeEach(() => {
    radioCliHome = mkdtempSync(join(tmpdir(), 'radiocli-cli-'));
    roots.push(radioCliHome);
    process.env.RADIOCLI_HOME = radioCliHome;
    delete process.env.RADIO_ATLAS_HOME;
    logs = [];
    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('RADIOCLI_HOME', originalRadioCliHome);
    restoreEnv('RADIO_ATLAS_HOME', originalRadioAtlasHome);

    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('prints help without creating user library state', async () => {
    await runCommand(['help']);

    expect(logs.join('\n')).toContain('radiocli doctor');
    expect(logs.join('\n')).toContain('radiocli add-url <url> [name]');
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('prints doctor setup guidance without creating user library state', async () => {
    await runCommand(['doctor']);

    expect(logs.join('\n')).toContain('npm_install=RadioCLI only; native playback comes from mpv or ffplay');
    expect(logs.join('\n')).toContain('install_mpv=');
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('rejects unknown commands with the help hint', async () => {
    await expect(runCommand(['wat'])).rejects.toThrow('Unknown command: wat\nRun radiocli help.');
  });

  it('adds direct stream URLs into the isolated imported library', async () => {
    await runCommand(['add-url', 'https://streams.example.com/live.mp3', 'Example', 'FM']);

    expect(logs).toEqual(['added=Example FM']);
    const state = JSON.parse(readFileSync(join(radioCliHome, 'radiocli.json'), 'utf8')) as {
      imported: Array<{id: string; name: string; streamUrl: string; provider: string; tags: string[]}>;
    };
    expect(state.imported).toHaveLength(1);
    expect(state.imported[0]).toMatchObject({
      provider: 'playlist',
      name: 'Example FM',
      streamUrl: 'https://streams.example.com/live.mp3',
      tags: ['custom']
    });
    expect(state.imported[0]?.id).toMatch(/^custom-/);
  });

  it('recognizes npm-linked symlink entrypoints as direct runs', () => {
    const moduleFile = join(radioCliHome, 'cli.js');
    const linkedFile = join(radioCliHome, 'radiocli');
    writeFileSync(moduleFile, '', 'utf8');
    symlinkSync(moduleFile, linkedFile);

    expect(isDirectRun(linkedFile, pathToFileURL(moduleFile).href)).toBe(true);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
