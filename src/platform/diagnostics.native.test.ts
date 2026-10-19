import {spawn, execFile} from 'node:child_process';
import {once} from 'node:events';
import {existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {probeAirPlayReadiness} from '../player/airplay-readiness.js';
import {probeDoctorScheduler} from './diagnostics.js';
import {identifyPlatform} from './runtime.js';

const run = promisify(execFile);

/** The Linux native CI job supplies D-Bus tools. The private daemon has only
 * harmless marker services; this never activates a real user/system service. */
describe.skipIf(process.platform !== 'linux' || !process.env.DBUS_SESSION_BUS_ADDRESS)('native read-only Doctor probes', () => {
  it('does not activate missing scheduler or Avahi services', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'radiocli-doctor-bus-'));
    const services = join(directory, 'services');
    mkdirSync(services);
    const markerScript = join(directory, 'mark.cjs');
    writeFileSync(markerScript, "require('node:fs').writeFileSync(process.argv[2], 'activated');\n");
    const markers = ['systemd', 'avahi'].map(name => join(directory, name));
    for (const [index, name] of ['org.freedesktop.systemd1', 'org.freedesktop.Avahi'].entries()) {
      writeFileSync(join(services, `${name}.service`), `[D-BUS Service]\nName=${name}\nExec=${quote(process.execPath)} ${quote(markerScript)} ${quote(markers[index]!)}\n`);
    }
    const config = join(directory, 'bus.conf');
    writeFileSync(config, `<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen><servicedir>${xml(services)}</servicedir><policy context="default"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy></busconfig>`);
    const daemon = spawn('dbus-daemon', ['--nofork', '--print-address=1', `--config-file=${config}`], {stdio: ['ignore', 'pipe', 'ignore']});
    const closed = once(daemon, 'close');
    try {
      let output = '';
      daemon.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      await until(() => output.includes('\n'));
      const address = output.split('\n')[0]!;
      const env = {...process.env, DBUS_SESSION_BUS_ADDRESS: address, DBUS_SYSTEM_BUS_ADDRESS: address};
      const scheduler = await probeDoctorScheduler(identifyPlatform({env}), env);
      expect(scheduler?.supported ?? false).toBe(false);
      const airPlay = await probeAirPlayReadiness({platform: 'linux', env, hasCommand: () => true,
        sender: async () => ({loaded: true, message: 'Fixture sender.'})});
      expect(airPlay.discoveryService).toBe('unavailable');
      expect(markers.map(existsSync)).toEqual([false, false]);

      // Positive control: prove this daemon really can activate the fixture.
      // get-property ignores --auto-start=no on systemd 252, so the production
      // probe must use an explicit Properties.Get method call instead.
      await run('busctl', [`--address=${address}`, '--auto-start=yes', '--timeout=0.5', 'call',
        'org.freedesktop.systemd1', '/org/freedesktop/systemd1', 'org.freedesktop.DBus.Properties', 'Get', 'ss',
        'org.freedesktop.systemd1.Manager', 'Version'], {timeout: 2000}).catch(() => undefined);
      await until(() => existsSync(markers[0]!));
    } finally {
      daemon.kill('SIGTERM');
      await closed;
      rmSync(directory, {recursive: true, force: true});
    }
  }, 10_000);
});

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('The private Doctor bus fixture did not become ready.');
}

function quote(value: string): string { return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`; }
function xml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
