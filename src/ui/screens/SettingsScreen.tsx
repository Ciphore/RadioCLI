import React from 'react';
import {Box, Text} from 'ink';
import type {AirPlayDevice, AppSettings, PlaybackDiagnostics, PlaybackState, ThemeName} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {settingsItems} from '../screen-items.js';
import {themeAccent} from '../theme.js';

type SettingsScreenProps = {
  selected: number;
  settings: AppSettings;
  storePath: string;
  playback: PlaybackState;
  backends: string[];
  airPlayDevices: AirPlayDevice[];
  providerHealth: Record<string, string>;
  theme: ThemeName;
  diagnostics: PlaybackDiagnostics;
  width: number;
};

export function SettingsScreen({
  selected,
  settings,
  storePath,
  playback,
  backends,
  airPlayDevices,
  providerHealth,
  theme,
  diagnostics,
  width
}: SettingsScreenProps): React.ReactElement {
  const accent = themeAccent(theme);
  const lineWidth = Math.max(32, width - 4);
  const health = Object.entries(providerHealth);

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
          items={settingsItems}
          selected={selected}
          keyFor={item => item}
          render={(item, _index, active) => {
            const value = settingValue(item, settings, diagnostics, backends, airPlayDevices);
            return (
              <Box>
                <Pointer active={active} />
                <Text color={active ? accent : undefined} bold={active}>
                  {item}
                </Text>
                {value ? (
                  <>
                    <Text color="gray"> · </Text>
                    <Text color={accent}>{value}</Text>
                  </>
                ) : null}
              </Box>
            );
          }}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray" bold>
          Status
        </Text>
        <Text color="gray">
          Player: <Text color={accent}>{playback.backend || 'none'}</Text> / {playback.state} ·{' '}
          {diagnostics.muted ? 'muted' : `vol ${diagnostics.volume}`} · tune timeout {settings.tuneTimeoutSeconds}s
        </Text>
        <Text color="gray">
          Provider health: {health.length ? health.map(([provider, status]) => `${provider} ${status}`).join(' · ') : 'not checked yet'}
        </Text>
        <Text color="gray">Active stream: {truncate(diagnostics.streamUrl ?? 'none', lineWidth - 15)}</Text>
        <Text color="gray">Library: {truncate(storePath, lineWidth - 9)}</Text>
      </Box>
    </Box>
  );
}

function settingValue(
  item: string,
  settings: AppSettings,
  diagnostics: PlaybackDiagnostics,
  backends: string[],
  airPlayDevices: AirPlayDevice[]
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
    case 'Cycle playback backend':
      return `${settings.preferredBackend} · available ${backends.length ? backends.join(', ') : 'none'}`;
    case 'Cycle AirPlay target': {
      const device = airPlayDevices.find(candidate => candidate.id === settings.preferredAirPlayDevice);
      return `${device?.name ?? settings.preferredAirPlayDevice ?? 'auto'} · ${airPlayDevices.length || 'no'} found`;
    }
    case 'Mute or unmute':
      return diagnostics.muted ? 'muted' : `vol ${diagnostics.volume}`;
    case 'Toggle skip broken streams':
      return settings.skipBrokenStreams ? 'on' : 'off';
    case 'Reset learned media keys':
      return `prev ${settings.mediaKeys.previous.length} · play ${settings.mediaKeys.playPause.length} · next ${settings.mediaKeys.next.length}`;
    default:
      return undefined;
  }
}
