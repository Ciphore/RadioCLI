export const sleepFadeMs = 30_000;
const maxTimerMs = 2_147_483_647;

type SleepPlayer = {fadeOut(durationMs: number, signal: AbortSignal): Promise<void>};

export function startSleepTimer(until: number, player: SleepPlayer, stop: () => void, now: () => number = Date.now): () => void {
  const abort = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const schedule = (): void => {
    const remaining = until - now();
    const fadeMs = Math.min(sleepFadeMs, Math.max(0, remaining));
    const wait = remaining - fadeMs;
    if (wait > 0) {
      timer = setTimeout(schedule, Math.min(maxTimerMs, wait));
      timer.unref();
      return;
    }
    void player.fadeOut(fadeMs, abort.signal).catch(() => undefined).then(() => { if (!abort.signal.aborted) stop(); });
  };
  schedule();
  return () => {
    clearTimeout(timer);
    abort.abort();
  };
}
