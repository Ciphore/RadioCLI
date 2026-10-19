import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveCommand} from './platform/executables.js';

type LocalBackend = 'mpv' | 'ffplay' | 'vlc';
export type PlaybackRehearsal = {
  backend: LocalBackend;
  status: 'passed' | 'failed' | 'unverified';
  source: 'local-wav';
  output: 'null' | 'dummy';
  physicalOutput: 'unverified';
  message: string;
};
type ProcessOptions = {env: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number};
type ProcessResult = {code: number | null; output: string; failure?: string};
type RehearsalOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  resolve?: typeof resolveCommand;
  execute?: (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;
};

/** Exercise local decoders without sending audio to an output device or receiver. */
export async function verifyLocalPlayback(backends: string[], options: RehearsalOptions = {}): Promise<PlaybackRehearsal[]> {
  options.signal?.throwIfAborted();
  const local = [...new Set(backends)].filter((value): value is LocalBackend => ['mpv', 'ffplay', 'vlc'].includes(value));
  if (!local.length) return [];
  const result = (backend: LocalBackend, status: PlaybackRehearsal['status'], message: string): PlaybackRehearsal => ({
    backend, status, source: 'local-wav', output: backend === 'mpv' ? 'null' : 'dummy', physicalOutput: 'unverified', message
  });
  if (options.platform && options.platform !== process.platform && !options.execute) {
    return local.map(backend => result(backend, 'unverified', 'The requested platform differs from the current runtime. Run the rehearsal on that device.'));
  }
  const directory = await mkdtemp(join(tmpdir(), 'radiocli-setup-'));
  try {
    const fixture = join(directory, 'local silence.wav');
    await writeFile(fixture, silentWav(), {mode: 0o600});
    const resolve = options.resolve ?? resolveCommand;
    const execute = options.execute ?? runDecoderProcess;
    const results: PlaybackRehearsal[] = [];
    for (const backend of local) {
      options.signal?.throwIfAborted();
      const command = backend === 'vlc' ? resolve('cvlc') ?? resolve('vlc') : resolve(backend);
      if (!command) {
        results.push(result(backend, 'failed', 'The executable was detected earlier but could not be resolved for the rehearsal.'));
        continue;
      }
      const args = backend === 'mpv'
        ? ['--no-config', '--no-video', '--ao=null', '--ao-null-untimed', '--idle=no', '--term-status-msg=', '--term-playing-msg=RADIOCLI_DECODER_READY', fixture]
        : backend === 'ffplay'
          ? ['-nodisp', '-autoexit', '-hide_banner', '-loglevel', 'info', fixture]
          : ['--ignore-config', '--intf', 'dummy', '--no-video', '--aout=dummy', '--no-one-instance', '--no-media-library', '--no-repeat', '--no-loop', '--play-and-exit', '--verbose=2', fixture];
      let completed: ProcessResult;
      try {
        completed = await execute(command, args, {
          env: {...options.env ?? process.env, LC_ALL: 'C', ...(backend === 'ffplay' ? {SDL_AUDIODRIVER: 'dummy', SDL_AUDIO_DRIVER: 'dummy', SDL_VIDEODRIVER: 'dummy', SDL_VIDEO_DRIVER: 'dummy'} : {})},
          timeoutMs: Math.max(250, Math.min(options.timeoutMs ?? 8000, 30_000)), signal: options.signal
        });
      } catch {
        options.signal?.throwIfAborted();
        completed = {code: null, output: '', failure: 'The playback process could not be started.'};
      }
      options.signal?.throwIfAborted();
      const fatal = hasPlaybackFailure(backend, completed.output);
      const observed = backend === 'mpv' ? completed.output.includes('RADIOCLI_DECODER_READY')
        : backend === 'ffplay' ? /Audio:\s*pcm_s16le/i.test(completed.output)
          : /using audio output module "(?:adummy|dummy)"/i.test(completed.output) && /(?:end of file|EOF)/i.test(completed.output);
      results.push(completed.failure || completed.code !== 0 || fatal
        ? result(backend, 'failed', completed.failure ?? `Local WAV playback failed${completed.code !== null ? ` (exit ${completed.code})` : ''}. Run radiocli doctor and check this backend's native dependencies.`)
        : observed ? result(backend, 'passed', 'Local WAV playback completed with a null or dummy audio output.')
          : result(backend, 'unverified', 'The process exited successfully, but it did not expose the expected playback evidence.'));
    }
    return results;
  } finally {
    await rm(directory, {force: true, recursive: true});
  }
}

function hasPlaybackFailure(backend: LocalBackend, output: string): boolean {
  return output.split(/\r?\n/).some(line => {
    if (!/\b(?:error|failed|could not|cannot|invalid data)\b/i.test(line)) return false;
    // The null-output rehearsal does not render OSD text. Minimal Linux installs
    // can lack fonts while the audio decoder and output complete successfully.
    if (backend === 'mpv' && /^\[osd(?:\/[^\]]+)?\]/i.test(line)) return false;
    if (backend === 'vlc') {
      // VLC logs rejected optional modules and build flags at debug level, and
      // starts desktop interfaces even with a dummy playback interface. Neither
      // proves failure of the isolated audio pipeline; readiness is checked below.
      if (/\bdebug:/i.test(line)) return false;
      if (/\b(?:dbus|interface)\b/i.test(line) && !/\b(?:audio output|decoder|demux|input|access|stream)\b/i.test(line)) return false;
    }
    return true;
  });
}

function runDecoderProcess(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const child = spawn(command, args, {env: options.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true});
    let output = '';
    let failure: string | undefined;
    let force: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(force);
      clearTimeout(deadline);
      options.signal?.removeEventListener('abort', abort);
      options.signal?.aborted ? reject(options.signal.reason) : resolve({code, output, failure});
    };
    const stop = (message: string) => {
      if (settled || failure) return;
      failure = message;
      try { child.kill(); } catch { /* The force deadline also covers failed termination. */ }
      force = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* Report through the cleanup deadline. */ } }, 250);
      deadline = setTimeout(() => {
        // A failed native termination must not hang setup or retain stdio handles.
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
        failure = 'The playback process did not acknowledge termination. Check for a remaining native player process.';
        finish(null);
      }, 1500);
    };
    const abort = () => stop('The rehearsal was cancelled.');
    const timeout = setTimeout(() => stop('Local WAV playback exceeded its deadline.'), options.timeoutMs);
    const collect = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-64 * 1024); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.once('error', () => { failure = 'The playback process could not be started.'; finish(null); });
    child.once('close', code => finish(code));
    options.signal?.addEventListener('abort', abort, {once: true});
    if (options.signal?.aborted) abort();
  });
}

function silentWav(): Buffer {
  const dataBytes = 44_100; // 250 ms, stereo, signed 16-bit PCM.
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF'); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(44_100, 24); buffer.writeUInt32LE(44_100 * 4, 28);
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
