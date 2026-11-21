import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {sleepFadeMs, startSleepTimer} from './sleep-timer.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function player() {
  const fades: number[] = [];
  return {
    fades,
    fadeOut: vi.fn(async (durationMs: number, signal: AbortSignal) => {
      fades.push(durationMs);
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, durationMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, {once: true});
      });
    })
  };
}

describe('sleep timer', () => {
  it('spends the final thirty seconds fading and stops exactly at the deadline', async () => {
    const stop = vi.fn();
    const target = player();
    startSleepTimer(Date.now() + 5 * 60_000, target, stop);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - sleepFadeMs - 1);
    expect(target.fadeOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(target.fades).toEqual([sleepFadeMs]);
    await vi.advanceTimersByTimeAsync(sleepFadeMs - 1);
    expect(stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('shortens the fade for a short timer and stops at once for an elapsed one', async () => {
    const stop = vi.fn();
    const target = player();
    startSleepTimer(Date.now() + 10_000, target, stop);
    startSleepTimer(Date.now() - 1, target, stop);
    await vi.advanceTimersByTimeAsync(0);
    expect(target.fades).toEqual([10_000, 0]);
    expect(stop).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('never stops playback after cancellation, before or during the fade', async () => {
    const stop = vi.fn();
    const target = player();
    startSleepTimer(Date.now() + 60_000, target, stop)();
    const cancel = startSleepTimer(Date.now() + 40_000, target, stop);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(target.fadeOut).toHaveBeenCalledOnce();
    cancel();
    expect(target.fadeOut.mock.calls[0]![1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stop).not.toHaveBeenCalled();
  });

  it('still stops when the fade itself fails', async () => {
    const stop = vi.fn();
    startSleepTimer(Date.now(), {fadeOut: async () => { throw new Error('player went away'); }}, stop);
    await vi.advanceTimersByTimeAsync(0);
    expect(stop).toHaveBeenCalledOnce();
  });
});
