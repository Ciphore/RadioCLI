import type {AppSettings, PlaybackDiagnostics} from '../types.js';
import {playbackBackendLabel} from '../player/backend-install.js';

export function audioOutputLabel(output: AppSettings['preferredBackend'] | string | null | undefined): string {
  if (output === 'auto') {
    return 'Automatic';
  }

  if (output === 'mpv') {
    return 'This device (mpv)';
  }

  if (output === 'ffplay') {
    return 'This device (ffplay fallback)';
  }

  if (output === 'airplay') {
    return 'AirPlay';
  }

  if (!output || output === 'none') {
    return 'No output';
  }

  return playbackBackendLabel(output);
}

export function resolvedAudioOutput(
  output: AppSettings['preferredBackend'],
  backends: readonly string[]
): AppSettings['preferredBackend'] | null {
  if (output !== 'auto') {
    return backends.includes(output) ? output : null;
  }

  for (const backend of ['mpv', 'ffplay'] as const) {
    if (backends.includes(backend)) {
      return backend;
    }
  }

  return null;
}

export function audioOutputSettingValue(
  settings: AppSettings,
  diagnostics: PlaybackDiagnostics,
  backends: readonly string[]
): string {
  const selected = settings.preferredBackend;
  const selectedLabel = audioOutputLabel(selected);
  const resolved = resolvedAudioOutput(selected, backends);

  if (!resolved) {
    return `${selectedLabel} · unavailable`;
  }

  if (diagnostics.active && diagnostics.backend !== 'none' && diagnostics.backend !== resolved) {
    return `${selectedLabel} · currently ${audioOutputLabel(diagnostics.backend)}`;
  }

  return selectedLabel;
}
