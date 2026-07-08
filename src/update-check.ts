import {realpathSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {appVersion} from './version.js';
import type {UpdateCheckState} from './types.js';

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_PACKAGE_NAME = '@ciphore/radiocli';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type CheckForUpdateOptions = {
  currentVersion?: string;
  fetchImpl?: FetchLike;
  now?: Date;
  packageName?: string;
  timeoutMs?: number;
};

type InstallMethod = 'homebrew' | 'npm' | 'unknown';

export type UpdateCommand = {
  method: InstallMethod;
  command: string;
};

export type UpdateInstallResult = {
  ok: boolean;
  command: string;
  output: string;
};

export async function checkForUpdate({
  currentVersion = appVersion(),
  fetchImpl = fetch,
  now = new Date(),
  packageName = UPDATE_PACKAGE_NAME,
  timeoutMs = 3000
}: CheckForUpdateOptions = {}): Promise<UpdateCheckState> {
  try {
    const response = await fetchWithTimeout(registryLatestUrl(packageName), fetchImpl, timeoutMs);
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status}`);
    }

    const parsed = await response.json() as {version?: unknown};
    const latestVersion = typeof parsed.version === 'string' ? parsed.version : undefined;
    if (!latestVersion) {
      throw new Error('npm registry response did not include a version');
    }

    return {
      checkedAt: now.toISOString(),
      currentVersion,
      latestVersion,
      updateAvailable: compareSemver(latestVersion, currentVersion) > 0
    };
  } catch (error) {
    return {
      checkedAt: now.toISOString(),
      currentVersion,
      updateAvailable: false,
      error: error instanceof Error ? error.message : 'Update check failed'
    };
  }
}

export function shouldCheckForUpdate(updateCheck: UpdateCheckState | undefined, now = Date.now()): boolean {
  if (process.env.RADIOCLI_DISABLE_UPDATE_CHECK === '1' || process.env.CI === 'true') {
    return false;
  }

  if (!updateCheck?.checkedAt) {
    return true;
  }

  const checkedAt = Date.parse(updateCheck.checkedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= UPDATE_CHECK_INTERVAL_MS;
}

export function updateStatusText(updateCheck: UpdateCheckState | undefined): string {
  if (!updateCheck) {
    return 'not checked yet';
  }

  if (updateCheck.updateAvailable && updateCheck.latestVersion) {
    return `v${updateCheck.latestVersion} available`;
  }

  if (updateCheck.error) {
    return `check failed: ${updateCheck.error}`;
  }

  return updateCheck.latestVersion ? `current at v${updateCheck.latestVersion}` : 'not checked yet';
}

export function updateCommandForInstall(entryPath = process.argv[1]): UpdateCommand {
  const resolved = resolvePath(entryPath);
  const haystack = [entryPath, resolved].filter(Boolean).join('\n');

  if (/\/(?:opt\/homebrew|usr\/local)\/(?:Cellar|Homebrew)\//.test(haystack) || /\/\.linuxbrew\/(?:Cellar|Homebrew)\//.test(haystack)) {
    return {method: 'homebrew', command: 'brew update && brew upgrade radiocli'};
  }

  if (/\/node_modules\/@ciphore\/radiocli\//.test(haystack)) {
    return {method: 'npm', command: 'npm install -g @ciphore/radiocli@latest'};
  }

  return {method: 'unknown', command: 'npm install -g @ciphore/radiocli@latest'};
}

export function installUpdate(command = updateCommandForInstall().command): Promise<UpdateInstallResult> {
  return new Promise(resolve => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
    const child = spawn(shell, args, {stdio: ['ignore', 'pipe', 'pipe']});
    const chunks: Buffer[] = [];

    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.on('error', error => {
      resolve({ok: false, command, output: error.message});
    });
    child.on('close', code => {
      const output = Buffer.concat(chunks).toString('utf8').trim();
      resolve({ok: code === 0, command, output});
    });
  });
}

export function compareSemver(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);

  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index]! - rightParts[index]!;
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function registryLatestUrl(packageName: string): string {
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
}

async function fetchWithTimeout(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

function semverParts(version: string): [number, number, number] {
  const normalized = version.trim().replace(/^v/i, '').split(/[+-]/)[0] ?? '';
  const [major = '0', minor = '0', patch = '0'] = normalized.split('.');
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

function resolvePath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
