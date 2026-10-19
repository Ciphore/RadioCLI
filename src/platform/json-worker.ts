import {Worker} from 'node:worker_threads';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';

const largeJsonCharacters = 256 * 1024;
const maxWorkers = 2;
const maxWaitingJobs = 8;
let activeWorkers = 0;
const waiting: Array<() => void> = [];

// Static code supports source and packed builds; values never become code.
const source = `
const {parentPort, workerData} = require('node:worker_threads');
try {
  const value = workerData.operation === 'parse' ? JSON.parse(workerData.value) : JSON.stringify(workerData.value);
  parentPort.postMessage({value});
} catch (error) {
  parentPort.postMessage({error: error.message});
}
parentPort.close();
`;

class WorkerUnavailableError extends Error {}

export function parseJsonAsync(value: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  return value.length < largeJsonCharacters ? Promise.resolve(JSON.parse(value)) : jsonInWorker('parse', value, signal);
}

export async function stringifyJsonAsync(value: unknown, large: boolean, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  return large ? jsonInWorker<string>('stringify', value, signal) : JSON.stringify(value);
}

async function jsonInWorker<T>(operation: 'parse' | 'stringify', value: unknown, signal?: AbortSignal): Promise<T> {
  await acquireWorker(signal);
  try {
    signal?.throwIfAborted();
    try {
      return await new Promise<T>((resolve, reject) => {
        let worker: Worker;
        try { worker = new Worker(source, {eval: true, workerData: {operation, value}, execArgv: []}); }
        catch (error) { reject(new WorkerUnavailableError('JSON workers are unavailable.', {cause: error})); return; }
        let settled = false;
        const finish = (error?: unknown, result?: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal?.removeEventListener('abort', aborted);
          void worker.terminate().catch(() => undefined);
          if (error !== undefined) reject(error);
          else resolve(result as T);
        };
        const aborted = () => finish(signal!.reason);
        const timeout = setTimeout(() => finish(new Error('JSON processing timed out.')), 30_000);
        signal?.addEventListener('abort', aborted, {once: true});
        worker.once('message', (result: {value?: T; error?: string}) => {
          if (result.error) finish(new SyntaxError(result.error));
          else finish(undefined, result.value);
        });
        worker.once('error', error => finish(error));
        worker.once('exit', code => finish(new Error(`JSON worker exited before completing (${code}).`)));
        if (signal?.aborted) aborted();
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof WorkerUnavailableError)) throw error;
      // Restricted runtimes remain functional. Yield first and honor abort;
      // these environments necessarily perform the final parse on this thread.
      await yieldToEventLoop();
      signal?.throwIfAborted();
      return (operation === 'parse' ? JSON.parse(value as string) : JSON.stringify(value)) as T;
    }
  } finally {
    activeWorkers -= 1;
    waiting.shift()?.();
  }
}

function acquireWorker(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (activeWorkers < maxWorkers) {
    activeWorkers += 1;
    return Promise.resolve();
  }
  if (waiting.length >= maxWaitingJobs) return Promise.reject(new Error('JSON processing is busy. Retry after the current requests finish.'));
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener('abort', aborted);
      activeWorkers += 1;
      resolve();
    };
    const aborted = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      signal?.removeEventListener('abort', aborted);
      reject(signal!.reason);
    };
    waiting.push(start);
    signal?.addEventListener('abort', aborted, {once: true});
  });
}
