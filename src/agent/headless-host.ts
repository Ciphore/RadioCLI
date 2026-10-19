import {PlayerController} from '../player/player-controller.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {LibraryRepository} from '../storage/repository.js';
import {RadioEngine} from '../player/radio-engine.js';
import type {Station} from '../types.js';
import {allowedRadioSessionSettings, resolveDesktopTransport, serializeRadioCommands, startRadioSession, type RadioSessionCommand, type RadioSessionResult, type RadioSessionStatus} from './session.js';
import {desktopMediaPolicy, startDesktopMediaControls} from '../platform/desktop-media.js';
import {detectPlaybackBackends} from '../player/backend-install.js';
import {networkPolicy} from '../platform/network.js';

export async function runHeadlessAgentHost(options: {store?: JsonLibraryStore; worker?: boolean} = {}): Promise<void> {
  const store = new LibraryRepository(options.store ?? new JsonLibraryStore(), {worker: options.worker});
  const providers = new ProviderManager();
  const player = new PlayerController(() => store.settings());
  player.refreshDetectedBackends();
  const engine = new RadioEngine(player, providers, store, () => store.settings());
  let persistenceWarning: string | undefined;
  let desktopSuspended = false;
  let shuttingDown = false;
  let media: ReturnType<typeof startDesktopMediaControls> | undefined;
  let tui: {pid: number; clientId: string} | undefined;
  let terminalProtocol = false;
  let focusNowPlaying = 0;
  let sleepUntil: number | null = null;
  let sleepTimer: NodeJS.Timeout | undefined;
  const scheduleSleep = () => {
    if (sleepUntil === null) return;
    const remaining = sleepUntil - Date.now();
    if (remaining <= 0) {
      sleepUntil = null;
      void dispatch({type: 'stop', retainSelection: true}).catch(() => undefined);
    } else {
      sleepTimer = setTimeout(scheduleSleep, Math.min(2_147_483_647, remaining));
      sleepTimer.unref();
    }
  };
  const tuiPresent = () => {
    if (!tui) return false;
    try { process.kill(tui.pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
  };

  const saveLibrary = async (write: () => Promise<unknown>): Promise<void> => {
    await write();
    persistenceWarning = undefined;
    engine.clearWarning();
  };
  const status = (): RadioSessionStatus => {
    const current = engine.snapshot();
    const settings = store.settings();
    return {owner: tuiPresent() ? 'tui' : 'headless', playback: player.getState(), station: current.station, nowPlaying: current.nowPlaying,
      queue: current.queue, persistenceWarning: persistenceWarning ?? current.warning, output: {
        preferredBackend: settings.preferredBackend === 'airplay' && player.airPlaySelectionRequired() ? 'auto' : settings.preferredBackend,
        preferredAirPlayDevice: settings.preferredAirPlayDevice
      }, ...(terminalProtocol ? {tui: {tuningStation: current.tuningStation, message: current.message, focusNowPlaying, sleepUntil, diagnostics: player.diagnostics(),
        devices: player.detectedAirPlayDevices(), selectionRequired: player.airPlaySelectionRequired(), desktopMediaCompatible: player.desktopMediaCompatible()}} : {})};
  };
  const result = (message: string, ok = true, data?: RadioSessionResult['data']): RadioSessionResult => ({ok, message, status: status(), ...(data ? {data} : {})});
  const play = async (next: Station, nextQueue: Station[] = [next], startPaused = false, signal?: AbortSignal): Promise<RadioSessionResult> => {
    signal?.throwIfAborted();
    // Earlier accepted output saves must reach their durable acknowledgement
    // before this tune chooses a backend. Stop can still cancel the wait.
    await store.readFresh();
    signal?.throwIfAborted();
    desktopSuspended = false;
    const tuned = await engine.tune(next, {queue: nextQueue, startPaused, signal});
    if (shuttingDown) return result('RadioCLI is shutting down.', false);
    media?.refresh();
    return result(`${startPaused ? 'Selected' : 'Playing'} ${tuned.name}.`);
  };

  const handle = async (command: RadioSessionCommand, signal?: AbortSignal): Promise<RadioSessionResult> => {
    if (shuttingDown) return result('RadioCLI is shutting down.', false);
    signal?.throwIfAborted();
    const {station, queue} = engine.snapshot();
    if (command.type === 'tui-attach') {
      if (tuiPresent() && tui?.clientId !== command.clientId) return result('RadioCLI is already open in another terminal.', false);
      tui = {pid: command.pid, clientId: command.clientId};
      terminalProtocol = true;
      return result(station ? `Reconnected to ${station.name}.` : 'RadioCLI connected.');
    }
    if (command.type === 'tui-detach') {
      if (tui?.clientId !== command.clientId) return result('This terminal no longer owns the RadioCLI view.', false);
      tui = undefined;
      shuttingDown = true;
      await engine.stop();
      // Let the command response finish, then close our own resources directly.
      // Sending SIGTERM to ourselves terminates Windows without running cleanup.
      setTimeout(onShutdown, 50).unref();
      return result('Closed RadioCLI.');
    }
    if (command.type === 'tui-cancel') { engine.cancel(); return result('Canceled pending tune.'); }
    if (command.type === 'tui-sleep') {
      clearTimeout(sleepTimer);
      sleepUntil = command.until;
      scheduleSleep();
      return result('Sleep timer updated.');
    }
    if (command.type === 'tui-adjust-volume') return handle({type: 'set-volume', volume: Math.max(0, Math.min(100, player.getState().volume + command.delta))}, signal);
    if (command.type === 'tui-toggle-muted') return handle({type: 'set-muted', muted: !player.getState().muted}, signal);
    if (command.type === 'tui-toggle-pause') {
      const control = await player.togglePause();
      await engine.flushHistory();
      return result(control.message ?? 'Playback updated.', control.ok);
    }
    if (command.type === 'tui-select') { engine.select(command.station, command.queue); media?.refresh(); return result(`Selected ${command.station.name}.`); }
    if (command.type === 'tui-refresh') { await store.readFresh(); player.refreshDetectedBackends(); return result('Playback settings refreshed.'); }
    if (command.type === 'tui-output') {
      await store.readFresh();
      const selected = await player.selectAirPlayDevice(command.deviceId);
      return result(selected ? 'Audio output selected.' : 'Audio output is unavailable.', selected);
    }
    if (command.type === 'desktop-transport') {
      const resolved = resolveDesktopTransport(command.action, status());
      return resolved ? handle(resolved, signal) : result('Playback state unchanged.');
    }
    if (['airplay-list', 'airplay-select', 'airplay-passcode'].includes(command.type) && !player.airPlayPolicy().enabled) {
      return result(player.airPlayPolicy().message, false, command.type === 'airplay-list' ? [] : undefined);
    }
    if (['airplay-list', 'airplay-select'].includes(command.type) && networkPolicy().offline) return result('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.', false, []);
    if (command.type === 'status') return result(station ? `${player.getState().state}: ${station.name}` : 'RadioCLI is idle.');
    if (command.type === 'play') {
      if (command.ifPlaying === 'keep' && ['playing', 'paused', 'loading'].includes(player.getState().state)) return result(`Kept current station ${station?.name ?? ''}.`);
      if (command.openNowPlaying) focusNowPlaying++;
      return play(command.station, command.queue, command.startPaused, signal);
    }
    if (command.type === 'pause') {
      const control = await engine.pause();
      return result(control.message ?? 'Paused.', control.ok);
    }
    if (command.type === 'resume') {
      if (command.restartStopped && station && ['idle', 'stopped'].includes(player.getState().state)) return play(station, queue, false, signal);
      const control = await engine.resume();
      return result(control.message ?? 'Resumed.', control.ok);
    }
    if (command.type === 'stop') {
      await engine.stop({retainSelection: command.retainSelection});
      if (command.retainSelection) { media?.refresh(); return result('Stopped playback.'); }
      if (!tuiPresent()) {
        shuttingDown = true;
        setTimeout(onShutdown, 50).unref();
      }
      return result('Stopped RadioCLI.');
    }
    if (command.type === 'alarm-preempt') {
      desktopSuspended = true;
      media?.refresh();
      await engine.stop();
      return result('Interactive playback yielded to the alarm.');
    }
    if (command.type === 'set-volume') {
      const control = command.unmute || command.allowStopped ? await player.setVolume(command.volume, {allowStopped: true}) : await player.setVolume(command.volume);
      if (control.ok) await saveLibrary(() => store.updateSettings({volume: player.getState().volume}));
      if (control.ok && command.unmute && command.volume > 0) {
        const unmuted = await player.setMuted(false, {allowStopped: true});
        if (!unmuted.ok) return result(unmuted.message ?? 'The output could not be unmuted.', false);
      }
      return result(control.message ?? `Volume ${player.getState().volume}.`, control.ok);
    }
    if (command.type === 'set-muted') { const control = await player.setMuted(command.muted, {allowStopped: command.allowStopped}); return result(control.message ?? (command.muted ? 'Muted.' : 'Unmuted.'), control.ok); }
    if (command.type === 'set-favorite') {
      const target = command.station ?? station;
      if (!target) return result('No active station to favorite.', false);
      const current = store.isFavorite(target);
      if (current !== command.favorite) await saveLibrary(() => store.toggleFavorite(target));
      if (command.favorite && !current && store.settings().shareDirectoryVotes) void providers.vote(target);
      return result(`${command.favorite ? 'Favorited' : 'Removed favorite'}: ${target.name}.`);
    }
    if (command.type === 'airplay-list') {
      const devices = await player.refreshAirPlayDevices();
      return result(devices.length ? `${devices.length} AirPlay receiver(s) found.` : 'No AirPlay receivers found.', true, devices);
    }
    if (command.type === 'airplay-select') {
      const devices = await player.refreshAirPlayDevices();
      signal?.throwIfAborted();
      const device = devices.find(item => item.id === command.deviceId);
      if (!device) return result('AirPlay receiver not found. Refresh and use an exact receiver ID.', false, devices);
      if (device.local) return switchToLocal(signal);
      if (!player.refreshDetectedBackends().includes('airplay')) return result('AirPlay playback is unavailable; run radiocli doctor.', false);
      await saveLibrary(() => store.updateSettings({preferredAirPlayDevice: device.id, preferredBackend: 'airplay'}));
      await player.selectAirPlayDevice(device.id);
      signal?.throwIfAborted();
      if (station && ['playing', 'paused', 'loading'].includes(player.getState().state)) return play(station, queue, false, signal);
      return result(`Audio output set to AirPlay receiver ${device.name}.`);
    }
    if (command.type === 'airplay-local') return switchToLocal(signal);
    if (command.type === 'airplay-passcode') {
      const control = await player.submitAirPlayPasscode(command.code);
      return result(control.message ?? 'AirPlay code sent.', control.ok);
    }
    if (command.type === 'update-settings') {
      if (!allowedRadioSessionSettings(command.settings)) return result('Session settings only accept appearance and agent control. Use radiocli setup --airplay to enable Linux AirPlay.', false);
      await saveLibrary(() => store.updateSettings(command.settings));
      return result('RadioCLI settings updated.');
    }
    if (command.type !== 'next' && command.type !== 'previous') throw new Error('Unsupported radio command.');
    const currentIndex = station ? queue.findIndex(item => stationKey(item) === stationKey(station!)) : -1;
    const delta = command.type === 'next' ? 1 : -1;
    const next = queue.length ? queue[(Math.max(0, currentIndex) + delta + queue.length) % queue.length] : undefined;
    if (next && command.preserveStop && ['idle', 'stopped'].includes(player.getState().state)) { engine.select(next, queue); media?.refresh(); return result(`Selected ${next.name}.`); }
    return next ? play(next, queue, Boolean(command.preservePause && player.getState().state === 'paused'), signal) : result('No playback queue is available.', false);
  };

  const switchToLocal = async (signal?: AbortSignal): Promise<RadioSessionResult> => {
    signal?.throwIfAborted();
    const backends = detectPlaybackBackends();
    const backend = backends.includes('mpv') ? 'mpv' : backends.includes('ffplay') ? 'ffplay' : backends.includes('vlc') ? 'vlc' : null;
    if (!backend) return result('No local playback backend is available. Run radiocli setup to install mpv.', false);
    await saveLibrary(() => store.updateSettings({preferredBackend: backend}));
    await player.selectAirPlayDevice(null);
    signal?.throwIfAborted();
    const {station, queue} = engine.snapshot();
    if (station && ['playing', 'paused', 'loading'].includes(player.getState().state)) return play(station, queue, false, signal);
    return result(`Audio output set to this device (${backend}).`);
  };

  const dispatch = serializeRadioCommands(handle, {responsive: true});
  const session = await startRadioSession((command, source) => dispatch(command, async () => {
    if (command.type.startsWith('tui-') && source !== 'cli') throw new Error('Terminal attachment requires a local CLI client.');
    if (source !== 'cli' && command.type !== 'status' && command.type !== 'alarm-preempt') {
      await store.readFresh();
      if (!store.settings().agentControl?.enabled) throw new Error('Agent controls are disabled.');
    }
    return true;
  }), undefined, {queue: 'owner'}).catch(async error => {
    try { await engine.close(); } finally { await store.close(); }
    throw error;
  });
  media = startDesktopMediaControls({player, identity: store.filePath, policy: desktopMediaPolicy(store.settings()), status,
    command: (command, permitted) => dispatch(command, () => permitted?.() !== false && !desktopSuspended), suspended: () => desktopSuspended});
  const unsubscribe = engine.onChange(() => media?.refresh());
  let shutdownPromise: Promise<void> | undefined;
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  const shutdown = () => shutdownPromise ??= (async () => {
    shuttingDown = true;
    clearTimeout(sleepTimer);
    desktopSuspended = true;
    for (const signal of signals) process.removeListener(signal, onShutdown);
    media?.close();
    unsubscribe();
    try { await engine.close(); } finally { await session.close(); await store.close(); }
  })();
  const onShutdown = () => { void shutdown().finally(() => process.exit(0)); };
  for (const signal of signals) process.once(signal, onShutdown);
  await new Promise<void>(() => undefined);
}
