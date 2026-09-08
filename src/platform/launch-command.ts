const applicationEnvironmentKeys = [
  'RADIOCLI_HOME',
  'RADIOCLI_MPV_PATH',
  'RADIOCLI_FFPLAY_PATH',
  'RADIOCLI_VLC_PATH',
  'RADIOCLI_FFMPEG_PATH',
  'RADIOCLI_OFFLINE',
  'RADIOCLI_LOW_BANDWIDTH'
] as const;

const desktopEnvironmentKeys = ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'] as const;

/** Persist only application settings and the desktop connection a job needs. */
export function launchEnvironment(
  env: NodeJS.ProcessEnv,
  options: {includeDesktop?: boolean; terminal?: string} = {}
): Record<string, string> {
  const result: Record<string, string> = {};
  const add = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    if (/[\r\n\0]/.test(value)) throw new Error(`${key} cannot contain control characters in a launch environment.`);
    result[key] = value;
  };
  for (const key of applicationEnvironmentKeys) add(key, env[key]);
  if (options.includeDesktop) for (const key of desktopEnvironmentKeys) add(key, env[key]);
  add('RADIOCLI_ALARM_TERMINAL', options.terminal);
  return result;
}

/** Keep application argv and approved environment out of native shell syntax. */
export function nodeLaunchCommand(nodePath: string, args: readonly string[], environment: Record<string, string>): string[] {
  if ([nodePath, ...args, ...Object.keys(environment), ...Object.values(environment)].some(value => value.includes('\0'))) {
    throw new Error('Launch command values cannot contain NUL bytes.');
  }
  // This fixed program contains no double quotes, including after expansion.
  // PowerShell 5 and Task Scheduler only receive this program and encoded data.
  const program = "const p=JSON.parse(Buffer.from(process.argv[1],'base64url').toString('utf8'));const r=require('node:child_process').spawnSync(process.execPath,p.args,{stdio:'inherit',env:{...process.env,...p.environment}});if(r.error)console.error(r.error.message);process.exit(r.status??1);";
  return [nodePath, '-e', program, Buffer.from(JSON.stringify({args, environment}), 'utf8').toString('base64url')];
}
