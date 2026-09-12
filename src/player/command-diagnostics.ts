import {spawnSync} from 'node:child_process';
import {resolveCommandDetails, type CommandDiscovery} from '../platform/executables.js';

export type CommandDiagnostic = {
  path: string | null;
  discovery: CommandDiscovery;
  launchable: boolean;
  version: string | null;
  error: string | null;
};

type DiagnosticOptions = {
  resolve: typeof resolveCommandDetails;
  execute: CommandExecutor;
};

type CommandExecutor = (
  command: string,
  args: string[],
  options: {encoding: 'utf8'; timeout: number; windowsHide: boolean}
) => {error?: Error; status: number | null; stdout?: string | Buffer; stderr?: string | Buffer};

export function diagnoseCommand(command: string, overrides: Partial<DiagnosticOptions> = {}): CommandDiagnostic {
  const resolution = (overrides.resolve ?? resolveCommandDetails)(command);
  if (!resolution.path) {
    return {...resolution, launchable: false, version: null, error: resolution.error ?? 'not found'};
  }

  const execute: CommandExecutor = overrides.execute ?? ((path, args, options) => spawnSync(path, args, options));
  const result = execute(resolution.path, ['--version'], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true
  });
  if (result.error) {
    return {...resolution, launchable: false, version: null, error: result.error.message};
  }
  if (result.status !== 0) {
    return {...resolution, launchable: false, version: null, error: `exited with status ${result.status ?? 'unknown'}`};
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return {
    ...resolution,
    launchable: true,
    version: output.split(/\r?\n/, 1)[0]?.trim() || null,
    error: null
  };
}
