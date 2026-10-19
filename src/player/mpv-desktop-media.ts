import {closeSync, constants, fstatSync, openSync, opendirSync, readSync, realpathSync, statSync} from 'node:fs';
import {posix} from 'node:path';

type MpvMediaPlan = {status: 'compatible' | 'unsupported'; args: string[]; reason: string};
type Options = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  executable?: string | null;
  /** Low-to-high mpv search order; test fixtures never inspect host config. */
  configDirectories?: readonly string[];
  stockMprisPath?: string;
};

const maxConfigBytes = 256 * 1024;
const maxScripts = 256;
const unsupported = (reason: string): MpvMediaPlan => ({status: 'unsupported', args: [], reason});
const compatible = (args: string[], reason: string): MpvMediaPlan => ({status: 'compatible', args, reason});

/**
 * mpv-mpris 1.3 has no per-process opt-out. Replace directory autoload with its
 * exact file list, omitting only the packaged plugin. mpv still reads its normal
 * configuration and loads every unrelated script. Nothing is written to disk.
 *
 * Source contracts: mpv player/scripting.c and options/path.c; mpv-mpris Makefile.
 * Configurations whose script-loading semantics cannot be preserved are left
 * completely alone; the application media service must then remain disabled.
 */
export function planMpvDesktopMedia(options: Options = {}): MpvMediaPlan {
  if ((options.platform ?? process.platform) !== 'linux') return unsupported('Desktop mpv media integration is available on Linux.');
  const env = options.env ?? process.env;
  const executable = options.executable ?? env.RADIOCLI_MPV_PATH ?? '/usr/bin/mpv';
  if (!options.configDirectories && !['/usr/bin/mpv', '/bin/mpv'].includes(executable)) {
    return unsupported('Desktop media controls require the packaged mpv configuration layout; the custom mpv executable was left unchanged.');
  }
  try {
    const directories = options.configDirectories ?? configDirectories(env);
    let stockMprisPath = options.stockMprisPath ?? '/usr/lib/mpv-mpris/mpris.so';
    try { stockMprisPath = realpathSync(stockMprisPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    let autoload = true;
    let ambiguous = false;
    // mpv loads encoding profiles first, then config/mpv.conf in each search
    // directory. A profile with script options is deliberately not reinterpreted.
    const files = [
      ...directories.map(directory => posix.join(directory, 'encoding-profiles.conf')),
      ...directories.flatMap(directory => ['config', 'mpv.conf'].map(file => posix.join(directory, file)))
    ];
    for (const file of files) {
      const contents = readConfig(file);
      if (contents === null) continue;
      let profile = false;
      for (const raw of contents.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('[')) { profile = !/^\[default\]\s*(?:#.*)?$/.test(line); continue; }
        // Includes and script lists can change startup script order or load
        // another media plugin. Ordinary profiles remain intact; script options
        // inside any profile are rejected even when that profile is inactive.
        if (/^(?:--)?(?:include|config(?:-dir)?|use-filedir-conf|scripts?(?:-(?:add|append|clr|del|pre|set|toggle|remove))?)\s*(?:=|$)/i.test(line)) { ambiguous = true; continue; }
        if (/^(?:--)?(?:no-)?load-scripts\b/i.test(line)) {
          const setting = /^(?:--)?load-scripts\s*=\s*(yes|no)\s*(?:#.*)?$/i.exec(line);
          if (profile || !setting) ambiguous = true;
          else autoload = setting[1]!.toLowerCase() === 'yes';
        }
      }
    }
    if (ambiguous) return unsupported('Custom mpv script, include, or profile directives require native media handling; mpv configuration and scripts were left unchanged.');
    if (!autoload) return compatible([], 'mpv directory scripts are disabled by the existing configuration.');

    const scripts: string[] = [];
    let omitted = 0;
    for (const directory of directories) {
      const entries = scriptFiles(posix.join(directory, 'scripts'));
      for (const file of entries) {
        if (scripts.length + omitted >= maxScripts) throw new Error('Too many mpv scripts to preserve within the bounded desktop media check.');
        const actual = realpathSync(file);
        if (actual === stockMprisPath) { omitted++; continue; }
        if (/^(?:mpv[-_])?mpris(?:\.(?:so|lua|js))?$/i.test(posix.basename(file)) || /^(?:mpv[-_])?mpris(?:\.(?:so|lua|js))?$/i.test(posix.basename(actual))) {
          return unsupported('A custom mpv MPRIS plugin needs native media handling; mpv configuration and scripts were left unchanged.');
        }
        scripts.push(file);
      }
    }
    if (!omitted) return compatible([], 'No stock mpv media plugin needs suppression.');
    return compatible(['--load-scripts=no', ...scripts.map(file => `--script=${file}`)], 'The stock mpv media plugin is omitted for this process; other scripts and configuration are preserved.');
  } catch {
    return unsupported('mpv script configuration could not be safely inspected; native mpv behavior is preserved.');
  }
}

function configDirectories(env: NodeJS.ProcessEnv): string[] {
  if (env.MPV_HOME !== undefined) {
    if (!env.MPV_HOME) return [];
    return [absolute(env.MPV_HOME)];
  }
  const result = ['/etc/mpv'];
  const home = env.HOME ? absolute(env.HOME) : null;
  const modern = env.XDG_CONFIG_HOME?.startsWith('/') ? posix.join(absolute(env.XDG_CONFIG_HOME), 'mpv') : home ? posix.join(home, '.config', 'mpv') : null;
  const legacy = home ? posix.join(home, '.mpv') : null;
  if (legacy && isDirectory(legacy)) result.push(legacy);
  if (modern && (modern !== legacy) && (!legacy || !isDirectory(legacy) || isDirectory(modern))) result.push(modern);
  return result;
}

function absolute(value: string): string {
  if (!posix.isAbsolute(value) || /[\0\r\n]/.test(value)) throw new Error('Ambiguous mpv configuration path.');
  return posix.normalize(value);
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

function readConfig(path: string): string | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size > maxConfigBytes) throw new Error('Unbounded mpv configuration.');
    const buffer = Buffer.alloc(maxConfigBytes + 1);
    const size = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (size > maxConfigBytes) throw new Error('Unbounded mpv configuration.');
    return buffer.toString('utf8', 0, size);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function scriptFiles(directory: string): string[] {
  let handle: ReturnType<typeof opendirSync>;
  try { handle = opendirSync(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files: string[] = [];
  let inspected = 0;
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (++inspected > 1024 || files.length >= maxScripts) throw new Error('Unbounded mpv script directory.');
      if (entry.name.startsWith('.')) continue;
      const path = posix.join(directory, entry.name);
      let info: ReturnType<typeof statSync>;
      try { info = statSync(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (info.isFile() || info.isDirectory()) files.push(path);
    }
  } finally { handle.closeSync(); }
  // Use stable ASCII ordering for explicit scripts, without locale collation.
  // Native mpv autoload order is not a reliable script dependency contract.
  const fold = (value: string) => Buffer.from(value.replace(/[A-Z]/g, letter => letter.toLowerCase()));
  return files.sort((left, right) => Buffer.compare(fold(left), fold(right)));
}
