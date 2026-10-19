import {afterEach, describe, expect, it, vi} from 'vitest';
import {desktopMediaPolicy, startDesktopMediaControls} from './desktop-media.js';
import type {OmarchyProfile} from './omarchy.js';
import * as mpris from './mpris.js';
import type {PlayerController, MetadataEvent, PlayerEvent} from '../player/player-controller.js';
import type {RadioSessionStatus} from '../agent/session.js';

afterEach(() => vi.restoreAllMocks());

const quattro: OmarchyProfile = {kind: 'quattro', version: '4.0.4-1', major: 4, source: 'package', packageName: 'omarchy', root: '/usr/share/omarchy', session: {type: 'wayland', remote: false, localDesktop: true}, terminal: {available: true, command: '/usr/bin/omarchy-launch-tui', missing: []}};
const env = {DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus'};
const compatible = () => ({status: 'compatible' as const, args: ['--load-scripts=no'], reason: 'Stock plugin suppressed.'});

describe('desktop media selection', () => {
  it('automatically enables only the packaged Quattro local desktop', () => {
    expect(desktopMediaPolicy({}, {platform: 'linux', env, omarchy: () => quattro, mpv: compatible})).toMatchObject({enabled: true, preference: 'auto', mpvArgs: ['--load-scripts=no']});
    for (const kind of ['legacy', 'development', 'unknown', 'none'] as const) {
      expect(desktopMediaPolicy({}, {platform: 'linux', env, omarchy: () => ({...quattro, kind}), mpv: compatible}).enabled).toBe(false);
    }
    expect(desktopMediaPolicy({}, {platform: 'linux', env, omarchy: () => ({...quattro, source: 'helper'}), mpv: compatible}).enabled).toBe(false);
    expect(desktopMediaPolicy({}, {platform: 'linux', env, omarchy: () => ({...quattro, session: {...quattro.session, localDesktop: false, remote: true}}), mpv: compatible}).enabled).toBe(false);
  });

  it.each(['darwin', 'win32', 'freebsd', 'openbsd', 'netbsd', 'android', 'aix', 'sunos'] as const)('keeps %s behavior unchanged without probing or loading D-Bus', platform => {
    const omarchy = vi.fn(); const mpv = vi.fn();
    expect(desktopMediaPolicy({desktopMediaControls: 'on'}, {platform, env, omarchy, mpv}).enabled).toBe(false);
    expect(omarchy).not.toHaveBeenCalled(); expect(mpv).not.toHaveBeenCalled();
  });

  it('supports explicit Linux opt-in and environment rollback without desktop detection', () => {
    const omarchy = vi.fn();
    expect(desktopMediaPolicy({desktopMediaControls: 'on'}, {platform: 'linux', env, omarchy, mpv: compatible}).enabled).toBe(true);
    expect(omarchy).not.toHaveBeenCalled();
    expect(desktopMediaPolicy({desktopMediaControls: 'on'}, {platform: 'linux', env: {...env, RADIOCLI_DESKTOP_MEDIA: 'off'}, mpv: compatible})).toMatchObject({enabled: false, preference: 'off', mpvArgs: []});
    expect(desktopMediaPolicy({desktopMediaControls: 'off'}, {platform: 'linux', env: {...env, RADIOCLI_DESKTOP_MEDIA: 'on'}, mpv: compatible}).enabled).toBe(true);
  });

  it('preserves playback when custom scripts cannot be safely inspected', () => {
    expect(desktopMediaPolicy({desktopMediaControls: 'on'}, {platform: 'linux', env, mpv: () => ({status: 'unsupported', args: [], reason: 'Custom profile.'})})).toMatchObject({enabled: false, reason: 'Custom profile.', mpvArgs: []});
  });

  it.each(['', 'tcp:host=example.test,port=1234', 'unixexec:path=/tmp/command', 'autolaunch:'])('does not connect to an unsafe or absent bus: %s', address => {
    const mpv = vi.fn();
    expect(desktopMediaPolicy({desktopMediaControls: 'on'}, {platform: 'linux', env: {DBUS_SESSION_BUS_ADDRESS: address}, mpv}).enabled).toBe(false);
    expect(mpv).not.toHaveBeenCalled();
  });
});

describe('desktop player event bridge', () => {
  it('clears an old broadcast title on stopped station selection and invalidates queued commands after disposal', async () => {
    const native = {refresh: vi.fn(), close: vi.fn()};
    const start = vi.spyOn(mpris, 'startMpris').mockReturnValue(native);
    const first = {provider: 'playlist' as const, id: 'first', name: 'First', tags: []};
    const second = {...first, id: 'second', name: 'Second'};
    const status: RadioSessionStatus = {owner: 'tui', station: first, queue: [first, second], playback: {backend: 'mpv', state: 'playing', ready: true, streamUrl: 'https://station.test/live', volume: 40, muted: false}};
    let metadata: MetadataEvent | undefined;
    let change: PlayerEvent | undefined;
    let permitted: (() => boolean) | undefined;
    const removeState = vi.fn(); const removeMetadata = vi.fn();
    const player = {
      desktopMediaCompatible: () => true,
      onChange(listener: PlayerEvent) { change = listener; listener(status.playback); return removeState; },
      onMetadata(listener: MetadataEvent) { metadata = listener; return removeMetadata; }
    } as unknown as PlayerController;
    const bridge = startDesktopMediaControls({player, identity: '/private/radio.json', policy: {enabled: true, preference: 'on', reason: 'test', mpvArgs: []}, status: () => status,
      command: async (_command, gate) => { permitted = gate; return {ok: true, message: 'queued', status}; }, suspended: () => false, env});
    const endpoint = start.mock.calls[0]![0];
    metadata!({title: 'Old station song', updatedAt: 'now'});
    expect(endpoint.snapshot().title).toBe('Old station song');
    status.playback = {...status.playback, state: 'stopped', ready: false};
    change!(status.playback);
    status.station = second;
    bridge.refresh();
    expect(endpoint.snapshot()).toMatchObject({station: second, title: undefined});
    await endpoint.command({type: 'next', preserveStop: true});
    expect(permitted!()).toBe(true);
    bridge.close();
    expect(permitted!()).toBe(false);
    expect(removeState).toHaveBeenCalledOnce(); expect(removeMetadata).toHaveBeenCalledOnce(); expect(native.close).toHaveBeenCalledOnce();
  });
});
