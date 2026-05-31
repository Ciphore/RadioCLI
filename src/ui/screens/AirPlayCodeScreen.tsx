import React from 'react';
import {Box, Text} from 'ink';
import type {AirPlayDevice, PlaybackState, ThemeName} from '../../types.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {textDim, themeAccent} from '../theme.js';

type AirPlayCodeScreenProps = {
  code: string;
  playback: PlaybackState;
  selectedDevice?: AirPlayDevice;
  theme: ThemeName;
  width: number;
};

export function AirPlayCodeScreen({
  code,
  playback,
  selectedDevice,
  theme,
  width
}: AirPlayCodeScreenProps): React.ReactElement {
  const accent = themeAccent(theme);
  const lineWidth = Math.max(24, width - 4);
  const promptActive = isAirPlayCodePromptActive(playback);
  const receiverName = playback.airPlayDeviceName ?? selectedDevice?.name ?? 'selected receiver';
  const masked = code.length > 0 ? '*'.repeat(code.length) : '';

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="AirPlay Code"
        subtitle="Enter the code shown on the receiver"
        right={promptActive ? 'Waiting for code' : 'Not requested'}
        width={width}
        theme={theme}
      />

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          Receiver: <Text color={accent}>{truncate(receiverName, Math.max(8, lineWidth - 10))}</Text>
        </Text>
        <Text color="gray">
          Playback: <Text color={accent}>{playback.backend}</Text> / {playback.state}
        </Text>
        <Text color={promptActive ? accent : 'yellow'}>
          {promptActive
            ? 'The receiver is asking for a code now.'
            : 'Tune a station with AirPlay first; this screen is used once the receiver asks for a code.'}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray" bold>
          Code
        </Text>
        <Text color={code ? accent : textDim}>{code ? masked : 'type the code from the receiver'}</Text>
        <Text color={textDim}>Enter submits · Backspace edits · Esc returns to AirPlay</Text>
      </Box>
    </Box>
  );
}

export function isAirPlayCodePromptActive(playback: PlaybackState): boolean {
  return playback.backend === 'airplay' && playback.message === 'AirPlay code required. Use :airplay-code 1234.';
}
