import React from 'react';
import {Box, Text} from 'ink';
import type {AirPlayDevice, AppSettings, PlaybackDiagnostics, PlaybackState, ThemeName, UpdateCheckState} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {settingsItems, settingsSectionFor} from '../screen-items.js';
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
  const menuWindow = settingsMenuWindow(selected, height);
  const selectedItem = settingsItems[selected];
  const activeSection = settingsSectionFor(selectedItem);
  const detail = settingDetail({
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
        subtitle={activeSection}
        width={width}
        theme={theme}
      />
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={menuWindow.items}
          selected={menuWindow.selectedOffset}
          keyFor={({item}) => item}
          render={(item, _index, active) => {
            const label = settingLabel(item.item, updateCheck);
            const value = settingValue(item.item, settings, diagnostics, backends, airPlayDevices, updateCheck);
            return (
              <Box flexDirection="column">
                {item.showSection ? (
                  <Text color={textMuted} bold>{item.section}</Text>
                ) : null}
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

type SettingsMenuEntry = {item: string; section: string; showSection: boolean; index: number};

function settingsMenuWindow(selected: number, height: number | undefined): {items: SettingsMenuEntry[]; selectedOffset: number} {
  const reservedRows = 6;
  const maxRows = height ? Math.max(5, height - reservedRows) : Number.POSITIVE_INFINITY;
  const clampedSelected = Math.min(Math.max(selected, 0), settingsItems.length - 1);
  const pages: SettingsMenuEntry[][] = [];
  let page: SettingsMenuEntry[] = [];
  let pageRows = 0;
  let previousSection = '';

  settingsItems.forEach((item, index) => {
    const section = settingsSectionFor(item);
    let showSection = section !== previousSection;
    let rowCost = 1 + (showSection ? 1 : 0);
    if (page.length > 0 && pageRows + rowCost > maxRows) {
      pages.push(page);
      page = [];
      pageRows = 0;
      previousSection = '';
      showSection = true;
      rowCost = 2;
    }

    page.push({item, section, showSection, index});
    pageRows += rowCost;
    previousSection = section;
  });

  if (page.length > 0) {
    pages.push(page);
  }

  const selectedPage = pages.find(candidate => candidate.some(entry => entry.index === clampedSelected)) ?? pages[0] ?? [];
  return {
    items: selectedPage,
    selectedOffset: Math.max(0, selectedPage.findIndex(entry => entry.index === clampedSelected))
  };
}

export function settingValue(
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
    case 'Check for updates':
      return updateStatusText(updateCheck);
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

export function settingLabel(item: string, updateCheck: UpdateCheckState | undefined): string {
  if (item === 'Check for updates' && updateCheck?.updateAvailable) {
    return 'Install update';
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
    return `RadioCLI v${appVersion} · ${updateStatusText(updateCheck)}`;
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
  return 'Press Enter to change this setting.';
}
