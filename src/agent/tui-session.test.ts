import {afterEach, describe, expect, it, vi} from 'vitest';
import * as session from './session.js';
import * as storage from '../platform/storage.js';
import * as loopback from '../platform/loopback.js';
import {openTuiSession, TuiSession} from './tui-session.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('optional terminal recovery', () => {
  it('explains how to restart an older host without stopping its playback automatically', async () => {
    const call = vi.fn().mockRejectedValue(new Error('Invalid radio command: type: Invalid discriminator value.'));
    vi.spyOn(session, 'ensureRadioSession').mockResolvedValue({call, status: vi.fn()});
    await expect(TuiSession.connect()).rejects.toThrow('running player predates TUI recovery');
    expect(call).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({type: 'tui-attach'}));
  });

  it('keeps inline playback available when the private runtime cannot be written', async () => {
    vi.spyOn(session, 'radioSessionMayBeActive').mockReturnValue(false);
    vi.spyOn(storage, 'storageReadiness').mockReturnValue({status: 'unavailable', message: 'read-only'});
    const launch = vi.spyOn(session, 'ensureRadioSession');
    expect(await openTuiSession()).toEqual({warning: expect.stringContaining('runtime directory is not writable')});
    expect(launch).not.toHaveBeenCalled();
  });

  it('keeps inline playback available when loopback is blocked', async () => {
    vi.spyOn(session, 'radioSessionMayBeActive').mockReturnValue(false);
    vi.spyOn(storage, 'storageReadiness').mockReturnValue({status: 'available', message: 'ok'});
    vi.spyOn(loopback, 'listenLoopback').mockRejectedValue(Object.assign(new Error('denied'), {code: 'EPERM'}));
    expect(await openTuiSession()).toEqual({warning: expect.stringContaining('blocks local loopback')});
  });

  it('does not start inline audio alongside a live or unknown playback owner', async () => {
    vi.stubEnv('RADIOCLI_TUI_PLAYBACK', 'inline');
    vi.spyOn(session, 'radioSessionMayBeActive').mockReturnValue(true);
    vi.spyOn(session, 'ensureRadioSession').mockRejectedValue(new Error('owner unavailable'));
    await expect(openTuiSession()).rejects.toThrow('owner unavailable');
  });
});
