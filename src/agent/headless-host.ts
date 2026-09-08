import {PlayerController} from '../player/player-controller.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import type {Station} from '../types.js';
import {startRadioSession, type RadioSessionCommand, type RadioSessionResult, type RadioSessionStatus} from './session.js';
import {detectPlaybackBackends} from '../player/backend-install.js';

export async function runHeadlessAgentHost(): Promise<void> {
  const store = new JsonLibraryStore();
  const providers = new ProviderManager();
  const player = new PlayerController(() => store.snapshot().settings);
  player.refreshDetectedBackends();
  let station: Station | null = null;
  let queue: Station[] = [];
  let persistenceWarning: string | undefined;

  const persistHistory = (write: () => unknown): void => {
    try {
      write();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      const detail = typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code) ? ` (${code})` : '';
      persistenceWarning = `Listening history was not saved${detail}. Check storage permissions or set RADIOCLI_HOME to a private writable directory.`;
    }
  };
  const saveLibrary = (write: () => unknown): void => {
    write();
    // Optional writes can be no-ops, so only an explicit successful save clears
    // a prior warning. Explicit failures still reject the control request.
    persistenceWarning = undefined;
  };

  const status = (): RadioSessionStatus => ({owner: 'headless', playback: player.getState(), station, queue, persistenceWarning, output: {
    preferredBackend: store.snapshot().settings.preferredBackend,
    preferredAirPlayDevice: store.snapshot().settings.preferredAirPlayDevice
  }});
  const result = (message: string, ok = true, data?: RadioSessionResult['data']): RadioSessionResult => ({ok, message, status: status(), ...(data ? {data} : {})});
  const play = async (next: Station, nextQueue: Station[] = [next]): Promise<RadioSessionResult> => {
    persistHistory(() => store.finishActiveListeningSession());
    await player.stop();
    const resolved = await providers.resolve(next);
    await player.play(next, resolved.url);
    station = next;
    queue = nextQueue.length ? nextQueue : [next];
    persistHistory(() => store.addRecent(next));
    persistHistory(() => store.startListeningSession(next));
    return result(`Playing ${next.name}.`);
  };

  const handle = async (command: RadioSessionCommand): Promise<RadioSessionResult> => {
    if (command.type === 'status') return result(station ? `${player.getState().state}: ${station.name}` : 'RadioCLI is idle.');
    if (command.type === 'play') {
      if (command.ifPlaying === 'keep' && ['playing', 'paused', 'loading'].includes(player.getState().state)) return result(`Kept current station ${station?.name ?? ''}.`);
      return play(command.station, command.queue);
    }
    if (command.type === 'pause') {
      const control = await player.pause();
      if (control.ok) persistHistory(() => store.finishActiveListeningSession());
      return result(control.message ?? 'Paused.', control.ok);
    }
    if (command.type === 'resume') {
      const control = await player.resume();
      if (control.ok && station) persistHistory(() => store.startListeningSession(station!));
      return result(control.message ?? 'Resumed.', control.ok);
    }
    if (command.type === 'stop') {
      persistHistory(() => store.finishActiveListeningSession());
      await player.stop();
      station = null;
      queue = [];
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50).unref();
      return result('Stopped RadioCLI.');
    }
    if (command.type === 'alarm-preempt') {
      persistHistory(() => store.finishActiveListeningSession());
      await player.stop();
      station = null;
      queue = [];
      return result('Interactive playback yielded to the alarm.');
    }
    if (command.type === 'set-volume') {
      const control = await player.setVolume(command.volume);
      if (control.ok) saveLibrary(() => store.updateSettings({volume: player.getState().volume}));
      return result(control.message ?? `Volume ${player.getState().volume}.`, control.ok);
    }
    if (command.type === 'set-muted') { const control = await player.setMuted(command.muted); return result(control.message ?? (command.muted ? 'Muted.' : 'Unmuted.'), control.ok); }
    if (command.type === 'set-favorite') {
      const target = command.station ?? station;
      if (!target) return result('No active station to favorite.', false);
      const current = store.isFavorite(target);
      if (current !== command.favorite) saveLibrary(() => store.toggleFavorite(target));
      if (command.favorite && !current && store.snapshot().settings.shareDirectoryVotes) void providers.vote(target);
      return result(`${command.favorite ? 'Favorited' : 'Removed favorite'}: ${target.name}.`);
    }
    if (command.type === 'airplay-list') {
      const devices = await player.refreshAirPlayDevices();
      return result(devices.length ? `${devices.length} AirPlay receiver(s) found.` : 'No AirPlay receivers found.', true, devices);
    }
    if (command.type === 'airplay-select') {
      const devices = await player.refreshAirPlayDevices();
      const device = devices.find(item => item.id === command.deviceId);
      if (!device) return result('AirPlay receiver not found. Refresh and use an exact receiver ID.', false, devices);
      if (device.local) return switchToLocal();
      if (!detectPlaybackBackends().includes('airplay')) return result('AirPlay playback is unavailable; run radiocli doctor.', false);
      saveLibrary(() => {
        store.updateSettings({preferredAirPlayDevice: device.id});
        store.updateSettings({preferredBackend: 'airplay'});
      });
      if (station && ['playing', 'paused', 'loading'].includes(player.getState().state)) return play(station, queue);
      return result(`Audio output set to AirPlay receiver ${device.name}.`);
    }
    if (command.type === 'airplay-local') return switchToLocal();
    if (command.type === 'airplay-passcode') {
      const control = player.submitAirPlayPasscode(command.code);
      return result(control.message ?? 'AirPlay code sent.', control.ok);
    }
    if (command.type === 'update-settings') {
      saveLibrary(() => store.updateSettings(command.settings));
      return result('RadioCLI settings updated.');
    }
    const currentIndex = station ? queue.findIndex(item => stationKey(item) === stationKey(station!)) : -1;
    const delta = command.type === 'next' ? 1 : -1;
    const next = queue.length ? queue[(Math.max(0, currentIndex) + delta + queue.length) % queue.length] : undefined;
    return next ? play(next, queue) : result('No playback queue is available.', false);
  };

  const switchToLocal = async (): Promise<RadioSessionResult> => {
    const backends = detectPlaybackBackends();
    const backend = backends.includes('mpv') ? 'mpv' : backends.includes('ffplay') ? 'ffplay' : backends.includes('vlc') ? 'vlc' : null;
    if (!backend) return result('No local playback backend is available. Run radiocli setup to install mpv.', false);
    saveLibrary(() => store.updateSettings({preferredBackend: backend}));
    if (station && ['playing', 'paused', 'loading'].includes(player.getState().state)) return play(station, queue);
    return result(`Audio output set to this device (${backend}).`);
  };

  const session = await startRadioSession(handle);
  const checkpoint = setInterval(() => {
    if (player.getState().state === 'playing') persistHistory(() => store.checkpointActiveListeningSession());
  }, 30_000);
  const shutdown = async () => {
    clearInterval(checkpoint);
    persistHistory(() => store.finishActiveListeningSession());
    await player.stop();
    await session.close();
  };
  process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
  await new Promise<void>(() => undefined);
}
