import React from 'react';
import {Box, Text} from 'ink';
import {defaultAgentControlSettings, type AirPlayDevice, type AppSettings, type PlaybackDiagnostics, type PlaybackState, type ThemeName, type UpdateCheckState} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {settingsGroup, settingsGroups, settingsItemsForPage, type SettingsPage} from '../screen-items.js';
import {textMuted, themeAccent} from '../theme.js';
import {playbackBackendCapabilities} from '../../player/backend-install.js';
import {airPlayReceiverSettingValue} from '../airplay-settings.js';
import {audioOutputLabel, audioOutputSettingValue} from '../audio-output.js';
import {updateStatusText} from '../../update-check.js';

type SettingsScreenProps = {
  page?: SettingsPage;
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
  page = 'root',
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
  const group = settingsGroup(page);
  const pageItems = settingsItemsForPage(page);
  const menuWindow = settingsMenuWindow(pageItems, selected, height);
  const selectedItem = pageItems[selected];
  const detail = page === 'root' && selectedItem !== 'Check for updates'
    ? settingsGroupsDescription(selectedItem)
    : settingDetail({
        item: selectedItem,
        appVersion,
        updateCheck,
        storePath,
        playback,
        providerHealth,
        diagnostics,
        lineWidth
      });
  const valueGap = 3;
  const labelWidth = Math.min(34, Math.max(20, lineWidth - valueGap - 24));
  const valueWidth = Math.max(12, Math.min(34, lineWidth - labelWidth - valueGap - 2));

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Settings"
        subtitle={group ? `Settings › ${group.label}` : 'Choose a category'}
        width={width}
        theme={theme}
      />
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={menuWindow.items}
          selected={menuWindow.selectedOffset}
          keyFor={item => item}
          render={(item, _index, active) => {
            const label = settingLabel(item, updateCheck, appVersion);
            const value = page === 'root'
              ? settingsRootValue(item)
              : settingValue(item, settings, diagnostics, backends, airPlayDevices, updateCheck, appVersion);
            return (
              <Box width={lineWidth}>
                <Pointer active={active} />
                <Box width={labelWidth}>
                  <Text color={active ? accent : undefined} bold={active}>
                    {truncate(label, labelWidth)}
                  </Text>
                </Box>
                <Box width={valueGap} />
                <Box width={valueWidth}>
                  <Text color={value ? accent : textMuted}>{truncate(value ?? '', valueWidth)}</Text>
                </Box>
              </Box>
            );
          }}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={textMuted} bold>Selected</Text>
        <Text color={textMuted}>{truncate(detail, lineWidth)}</Text>
      </Box>
    </Box>
  );
}

function settingsMenuWindow(items: readonly string[], selected: number, height: number | undefined): {items: string[]; selectedOffset: number} {
  const reservedRows = 6;
  const maxRows = height ? Math.max(5, height - reservedRows) : Number.POSITIVE_INFINITY;
  const clampedSelected = Math.min(Math.max(selected, 0), items.length - 1);
  const pageSize = Number.isFinite(maxRows) ? Math.max(1, Math.floor(maxRows)) : items.length;
  const pageStart = Math.floor(clampedSelected / pageSize) * pageSize;
  const selectedPage = items.slice(pageStart, pageStart + pageSize);
  return {
    items: [...selectedPage],
    selectedOffset: clampedSelected - pageStart
  };
}

function settingsRootValue(item: string): string | undefined {
  const group = settingsGroupByLabel(item);
  return group ? `${group.items.length} settings ›` : undefined;
}

function settingsGroupByLabel(label: string) {
  return settingsGroups.find(group => group.label === label);
}

function settingsGroupsDescription(label: string | undefined): string {
  return label ? settingsGroupByLabel(label)?.description ?? 'Press Enter to open this category.' : '';
}

export function settingValue(
  item: string,
  settings: AppSettings,
  diagnostics: PlaybackDiagnostics,
  backends: string[],
  airPlayDevices: AirPlayDevice[],
  updateCheck: UpdateCheckState | undefined,
  currentVersion?: string
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
    case 'Share favorite votes with Radio Browser':
      return settings.shareDirectoryVotes ? 'on' : 'off';
    case 'Audio output':
      return audioOutputSettingValue(settings, diagnostics, backends);
    case 'AirPlay receiver':
      return airPlayReceiverSettingValue(settings, airPlayDevices, backends);
    case 'Mute or unmute':
      if (!playbackBackendCapabilities(diagnostics.backend).supportsMute) {
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
    case 'Mouse and trackpad scrolling':
      return settings.mouseSupport === false ? 'off' : 'auto';
    case 'Automatically check for updates':
      return settings.automaticUpdateChecks === false ? 'off' : 'on';
    case 'Allow local agent control':
      return (settings.agentControl ?? defaultAgentControlSettings).enabled ? 'on' : 'off';
    case 'Install or repair MCP integrations':
      return 'run repair';
    case 'Open TUI for agent playback':
      return (settings.agentControl ?? defaultAgentControlSettings).openUiOnPlay ? 'on' : 'off';
    case 'Show Now Playing for agent playback':
      return (settings.agentControl ?? defaultAgentControlSettings).focusNowPlaying ? 'on' : 'off';
    case 'Check for updates':
      return updateStatusText(updateCheck, currentVersion);
    case 'Reset learned media keys':
      return `prev ${settings.mediaKeys.previous.length} · play ${settings.mediaKeys.playPause.length} · next ${settings.mediaKeys.next.length}`;
    case 'Export preferences and library':
      return 'JSON backup';
    case 'Import preferences and library':
      return 'restore JSON backup';
    default:
      return undefined;
  }
}

export function settingLabel(item: string, updateCheck: UpdateCheckState | undefined, currentVersion?: string): string {
  if (item === 'Check for updates') {
    return updateStatusText(updateCheck, currentVersion).endsWith('available') ? 'Install update' : 'Check now';
  }

  return settingDisplayLabels[item] ?? item;
}

const settingDisplayLabels: Record<string, string> = {
  'Cycle display color': 'Display color',
  'Cycle receiver style': 'Receiver style',
  'Toggle nearby location lookup': 'Nearby location',
  'Toggle Radio Garden experimental adapter': 'Radio Garden adapter',
  'Toggle skip broken streams': 'Skip broken streams'
};

function settingDetail(input: {
  item: string | undefined;
  appVersion: string;
  updateCheck?: UpdateCheckState;
  storePath: string;
  playback: PlaybackState;
  providerHealth: Record<string, string>;
  diagnostics: PlaybackDiagnostics;
  lineWidth: number;
}): string {
  const {item, appVersion, updateCheck, storePath, playback, providerHealth, diagnostics, lineWidth} = input;
  if (item === 'Audio output') {
    return `Active: ${audioOutputLabel(playback.backend)} · ${playback.state} · ${diagnostics.muted ? 'muted' : `volume ${diagnostics.volume}`}`;
  }
  if (item === 'Refresh provider health') {
    const health = Object.entries(providerHealth);
    return health.length ? health.map(([provider, status]) => `${provider}: ${status}`).join(' · ') : 'Press Enter to check station providers.';
  }
  if (item === 'Check for updates') {
    return `RadioCLI v${appVersion} · ${updateStatusText(updateCheck, appVersion)}`;
  }
  if (item === 'Automatically check for updates') {
    return 'When enabled, RadioCLI checks the registry once whenever the app launches.';
  }
  if (item === 'Export preferences and library' || item === 'Import preferences and library') {
    return `Library file: ${truncate(storePath, Math.max(8, lineWidth - 14))}`;
  }
  if (item === 'Share favorite votes with Radio Browser') {
    return 'When enabled, favoriting also sends a public directory vote.';
  }
  if (item === 'Toggle nearby location lookup') {
    return 'Uses approximate IP location only when you open Nearby.';
  }
  if (item === 'Reduce motion') {
    return 'Freezes animated receiver displays for calmer, lower-power rendering.';
  }
  if (item === 'Allow local agent control') {
    return 'Press Enter to set up or remove agent and Codex Voice control across detected clients.';
  }
  if (item === 'Install or repair MCP integrations') {
    return 'Checks and repairs every detected client. Restart open Codex or agent clients afterward.';
  }
  if (item === 'Open TUI for agent playback') {
    return 'Opt in to a separate terminal window. On macOS, the agent app must approve a one-time Automation prompt.';
  }
  return 'Press Enter to change this setting.';
}
