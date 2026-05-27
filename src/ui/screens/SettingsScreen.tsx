import React from 'react';
import {Box, Text} from 'ink';
import type {AppSettings, PlaybackDiagnostics, PlaybackState, ThemeName} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {truncate} from '../format.js';
import {settingsItems} from '../screen-items.js';
import {themeAccent} from '../theme.js';

type SettingsScreenProps = {
  selected: number;
  settings: AppSettings;
  storePath: string;
  playback: PlaybackState;
  backends: string[];
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
  providerHealth,
  theme,
  diagnostics,
  width
}: SettingsScreenProps): React.ReactElement {
  const lineWidth = Math.max(32, width - 4);

  return (
    <Box flexDirection="column">
      <Text bold>Settings</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Display color: <Text color={themeAccent(theme)}>{settings.theme}</Text>
        </Text>
        <Text>
          Spectrum style: <Text color={themeAccent(theme)}>{settings.receiverStyle}</Text>
        </Text>
        <Text>
          Playback backend: <Text color={themeAccent(theme)}>{settings.preferredBackend}</Text>
          <Text color="gray"> · available {backends.length ? backends.join(', ') : 'none'}</Text>
        </Text>
        <Text>
          Radio Garden: <Text color={settings.enableRadioGarden ? themeAccent(theme) : 'gray'}>{settings.enableRadioGarden ? 'on' : 'off'}</Text>
        </Text>
        <Text>
          Nearby location: <Text color={settings.enableNearbyLocation ? themeAccent(theme) : 'gray'}>{settings.enableNearbyLocation ? 'on' : 'off'}</Text>
        </Text>
        <Text>
          Skip broken streams: <Text color={settings.skipBrokenStreams ? themeAccent(theme) : 'gray'}>{settings.skipBrokenStreams ? 'on' : 'off'}</Text>
        </Text>
        <Text color="gray">Tune timeout: {settings.tuneTimeoutSeconds}s</Text>
        <Text color="gray">Learned media keys: prev {settings.mediaKeys.previous.length} · play {settings.mediaKeys.playPause.length} · next {settings.mediaKeys.next.length}</Text>
        <Text color="gray">Current player: {playback.backend} / {playback.state}</Text>
        <Text color="gray">Volume: {diagnostics.muted ? 'muted' : diagnostics.volume}</Text>
        <Text color="gray">Active stream: {truncate(diagnostics.streamUrl ?? 'none', lineWidth - 15)}</Text>
        <Text color="gray">Library: {truncate(storePath, lineWidth - 9)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Provider health</Text>
        {Object.entries(providerHealth).map(([provider, status]) => (
          <Text key={provider} color="gray">
            {provider}: {status}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Menu
          items={settingsItems}
          selected={selected}
          keyFor={item => item}
          render={(item, _index, active) => (
            <Box>
              <Pointer active={active} />
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {item}
              </Text>
            </Box>
          )}
        />
      </Box>
    </Box>
  );
}
