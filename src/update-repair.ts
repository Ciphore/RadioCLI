import {spawn} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {stableInstallationPath, installationExists} from './platform/installation.js';

type Runtime = {nodePath: string; cliPath: string};
export type UpdateRepairResult = {mcp: 'disabled' | 'repaired' | 'partial'; alarms: number; failures: string[]};

/** Resolve while the old installation exists; execute only after replacement.
 * This closure does not import anything from the retired package. */
export function prepareUpdateRepair(runtime: Runtime): () => Promise<UpdateRepairResult> {
  let cliPath = stableInstallationPath(runtime.cliPath);
  try {
    if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(runtime.cliPath)) cliPath = stableInstallationPath(process.argv[1]);
  } catch { /* Library callers need not have a CLI argv entry. */ }
  const updated = {nodePath: stableInstallationPath(runtime.nodePath), cliPath};
  return () => new Promise((resolve, reject) => {
    if (!installationExists(updated)) { reject(new Error('The updated installation could not be resolved. Run radiocli mcp repair and radiocli alarm sync from the new installation.')); return; }
    const child = spawn(updated.nodePath, [updated.cliPath, 'internal-reconcile-update'], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    let output = ''; let errorOutput = ''; let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error);
      else try {
        const result: unknown = JSON.parse(output);
        if (!isRepairResult(result)) throw new Error('Invalid result');
        resolve(result);
      } catch { reject(new Error('The updated installation returned an invalid repair result.')); }
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Post-update repair timed out. Run radiocli alarm sync and radiocli mcp repair.')); }, 60_000);
    child.stdout.on('data', value => { output += String(value); if (output.length > 1024 * 1024) { child.kill(); finish(new Error('Post-update repair response was too large.')); } });
    child.stderr.on('data', value => { errorOutput = (errorOutput + String(value)).slice(-4096); });
    child.once('error', finish);
    child.once('close', code => finish(code === 0 ? undefined : new Error(errorOutput.trim() || `Post-update repair exited with code ${code}.`)));
  });
}

function isRepairResult(value: unknown): value is UpdateRepairResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<UpdateRepairResult>;
  return ['disabled', 'repaired', 'partial'].includes(result.mcp ?? '') && Number.isSafeInteger(result.alarms) && result.alarms! >= 0
    && Array.isArray(result.failures) && result.failures.every(failure => typeof failure === 'string');
}

/** Runs exclusively inside the newly installed process. */
export async function reconcileUpdatedInstallation(runtime: Runtime): Promise<UpdateRepairResult> {
  const [{JsonLibraryStore}, {createSchedulerService}] = await Promise.all([import('./storage/store.js'), import('./alarms/scheduler.js')]);
  const store = new JsonLibraryStore();
  const result: UpdateRepairResult = {mcp: 'disabled', alarms: 0, failures: []};
  const alarms = store.listAlarms();
  if (alarms.length) {
    const registrations = await createSchedulerService(runtime).syncAll(alarms);
    result.alarms = registrations.filter(item => !item.error && !item.deferred).length;
    result.failures.push(...registrations.flatMap(item => item.error ? [`Alarm ${item.id}: ${item.error}`]
      : item.deferred ? [`Alarm ${item.id} is currently playing. Dismiss it, then run radiocli alarm sync to finish post-update registration repair.`] : []));
  }
  if (store.settings().agentControl?.enabled) {
    try {
      const {configureMcpIntegrations} = await import('./agent/mcp-install.js');
      const registrations = await configureMcpIntegrations(true, runtime, null);
      const failed = registrations.filter(item => item.status === 'failed');
      result.mcp = failed.length ? 'partial' : 'repaired';
      result.failures.push(...failed.map(item => `${item.client}: ${item.detail}`));
    } catch (error) { result.mcp = 'partial'; result.failures.push(error instanceof Error ? error.message : String(error)); }
  }
  return result;
}
