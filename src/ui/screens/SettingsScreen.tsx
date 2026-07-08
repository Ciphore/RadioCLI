import React from 'react';
import {Box, Text} from 'ink';
import type {AirPlayDevice, AppSettings, PlaybackDiagnostics, PlaybackState, ThemeName, UpdateCheckState} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {settingsItems} from '../screen-items.js';
import {textMuted, themeAccent} from '../theme.js';
import {playbackBackendCapabilities} from '../../player/backend-install.js';
import {airPlayReceiverSettingValue} from '../airplay-settings.js';
import {audioOutputLabel, audioOutputSettingValue} from '../audio-output.js';
import {updateStatusText} from '../../update-check.js';

type SettingsScreenProps = {
  selected: number;
  settings: AppSettings;
  appVersion: string;
  updateCheck?: UpdateCheckState;
  storePath: string;
  playback: PlaybackState;
  backends: string[];
  airPlayDevices: AirPlayDevice[];
  providerHealth: Record<string, string>;
  theme: ThemeName;
  diagnostics: PlaybackDiagnostics;
  width: number;
  height?: number;
};

export function SettingsScreen({
  selected,
  settings,
  appVersion,
  updateCheck,
  storePath,
  playback,
  backends,
  airPlayDevices,
  providerHealth,
  theme,
  diagnostics,
  width,
  height
}: SettingsScreenProps): React.ReactElement {
  const accent = themeAccent(theme);
  const lineWidth = Math.max(32, width - 4);
  const health = Object.entries(providerHealth);
  const menuWindow = settingsMenuWindow(selected, height);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Settings"
        subtitle="Enter changes the highlighted setting · shortcuts in the footer"
        width={width}
        theme={theme}
      />
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={menuWindow.items}
          selected={selected - menuWindow.start}
          keyFor={({item}) => item}
          render={(item, _index, active) => {
            const label = settingLabel(item.item, updateCheck);
            const value = settingValue(item.item, settings, diagnostics, backends, airPlayDevices, updateCheck);
            return (
              <Box>
                <Pointer active={active} />
                <Text color={active ? accent : undefined} bold={active}>
                  {label}
                </Text>
                {value ? (
                  <>
                    <Text color={textMuted}> · </Text>
                    <Text color={accent}>{value}</Text>
                  </>
                ) : null}
              </Box>
            );
          }}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={textMuted} bold>
          Status
        </Text>
        <Text color={textMuted}>
          Output: <Text color={accent}>{audioOutputLabel(playback.backend)}</Text> / {playback.state} ·{' '}
          Selected: <Text color={accent}>{audioOutputLabel(settings.preferredBackend)}</Text> ·{' '}
          {diagnostics.muted ? 'muted' : `vol ${diagnostics.volume}`} · tune timeout {settings.tuneTimeoutSeconds}s
        </Text>
        <Text color={textMuted}>
          Provider health: {health.length ? health.map(([provider, status]) => `${provider} ${status}`).join(' · ') : 'not checked yet'}
        </Text>
        <Text color={textMuted}>
          Version: <Text color={accent}>v{appVersion}</Text> · Update: {updateStatusText(updateCheck)}
        </Text>
        <Text color={textMuted}>Active stream: {truncate(diagnostics.streamUrl ?? 'none', lineWidth - 15)}</Text>
        <Text color={textMuted}>Library: {truncate(storePath, lineWidth - 9)}</Text>
      </Box>
    </Box>
  );
}

function settingsMenuWindow(selected: number, height: number | undefined): {start: number; items: Array<{item: string}>} {
  if (!height) {
    return {start: 0, items: settingsItems.map(item => ({item}))};
  }

  const reservedRows = 10;
  const maxRows = Math.max(5, height - reservedRows);
  if (settingsItems.length <= maxRows) {
    return {start: 0, items: settingsItems.map(item => ({item}))};
  }

  const clampedSelected = Math.min(Math.max(selected, 0), settingsItems.length - 1);
  const start = Math.min(
    Math.floor(clampedSelected / maxRows) * maxRows,
    Math.max(0, settingsItems.length - maxRows)
  );
  return {
    start,
    items: settingsItems.slice(start, start + maxRows).map(item => ({item}))
  };
}

function settingValue(
  item: string,
  settings: AppSettings,
  diagnostics: PlaybackDiagnostics,
  backends: string[],
  airPlayDevices: AirPlayDevice[],
  updateCheck: UpdateCheckState | undefined
): string | undefined {
  switch (item) {
    case 'Cycle display color':
      return settings.theme;
    case 'Cycle receiver style':
      return settings.receiverStyle;
    case 'Toggle Radio Garden experimental adapter':
      return settings.enableRadioGarden ? 'on' : 'off';
    case 'Toggle nearby location lookup':
      return settings.enableNearbyLocation ? 'on' : 'off';
    case 'Audio output':
      return audioOutputSettingValue(settings, diagnostics, backends);
    case 'AirPlay receiver':
      return airPlayReceiverSettingValue(settings, airPlayDevices, backends);
    case 'Mute or unmute':
      if (diagnostics.backend === 'ffplay' && !playbackBackendCapabilities(diagnostics.backend).supportsMute) {
        return 'requires mpv';
      }
      return diagnostics.muted ? 'muted' : `vol ${diagnostics.volume}`;
    case 'Toggle skip broken streams':
      return settings.skipBrokenStreams ? 'on' : 'off';
    case 'Resume last station on launch':
      return settings.resumeOnLaunch ? 'on' : 'off';
    case 'Transparent background':
      return settings.transparentBackground ? 'on' : 'off';
    case 'ASCII-safe display':
      return settings.asciiMode ? 'on' : 'off';
    case 'Reduce motion':
      return settings.reduceMotion ? 'on' : 'off';
    case 'Check for updates':
      return updateStatusText(updateCheck);
    case 'Reset learned media keys':
      return `prev ${settings.mediaKeys.previous.length} · play ${settings.mediaKeys.playPause.length} · next ${settings.mediaKeys.next.length}`;
    default:
      return undefined;
  }
}

function settingLabel(item: string, updateCheck: UpdateCheckState | undefined): string {
  if (item === 'Check for updates' && updateCheck?.updateAvailable) {
    return 'Install update';
  }

  return item;
}
