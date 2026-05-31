import React from 'react';
import {Box, Text} from 'ink';
import type {AirPlayDevice, AppSettings, ThemeName} from '../../types.js';
import {
  airPlayAvailability,
  airPlayDeviceDetail,
  selectedAirPlayDevice
} from '../airplay-settings.js';
import {audioOutputLabel} from '../audio-output.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {textDim, themeAccent} from '../theme.js';

type AirPlaySettingsScreenProps = {
  selected: number;
  settings: AppSettings;
  backends: string[];
  devices: AirPlayDevice[];
  theme: ThemeName;
  width: number;
};

export function AirPlaySettingsScreen({
  selected,
  settings,
  backends,
  devices,
  theme,
  width
}: AirPlaySettingsScreenProps): React.ReactElement {
  const accent = themeAccent(theme);
  const availability = airPlayAvailability(backends, devices);
  const selectedDevice = selectedAirPlayDevice(settings, devices);
  const selectedMissing = Boolean(settings.preferredAirPlayDevice && !selectedDevice);
  const canEnterCode = availability.ready && selectedDevice?.requiresPassword && !selectedDevice.local;
  const lineWidth = Math.max(24, width - 4);
  const preferredOutput = audioOutputLabel(settings.preferredBackend);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="AirPlay"
        subtitle="Choose where AirPlay playback should go"
        right={availability.label}
        width={width}
        theme={theme}
      />

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          Audio output: <Text color={accent}>{preferredOutput}</Text> · Streaming:{' '}
          <Text color={availability.ready ? accent : 'yellow'}>{availability.ready ? 'ready' : 'unavailable'}</Text> · Receivers:{' '}
          <Text color={accent}>{devices.length}</Text>
        </Text>
        <Text color={availability.ready ? 'gray' : 'yellow'}>{truncate(availability.detail, lineWidth)}</Text>
        <Text color="gray">
          Selected: <Text color={selectedDevice ? accent : textDim}>{truncate(selectedDevice?.name ?? 'none', Math.max(4, lineWidth - 10))}</Text>
        </Text>
        {availability.ready && selectedDevice?.requiresPassword && !selectedDevice.local ? (
          <Text color="gray">
            Code: <Text color={accent}>if the receiver shows a code while tuning, RadioCLI will ask for it</Text>
          </Text>
        ) : null}
        {selectedMissing ? (
          <Text color="yellow">
            Saved receiver is not visible: {truncate(settings.preferredAirPlayDevice ?? '', Math.max(8, lineWidth - 31))}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray" bold>
          Receivers
        </Text>
        {devices.length > 0 ? (
          <Menu
            items={devices}
            selected={selected}
            keyFor={device => device.id}
            render={(device, _index, active) => {
              const isSelected = device.id === settings.preferredAirPlayDevice;
              const name = truncate(device.name, Math.max(8, Math.floor(lineWidth * 0.35)));
              const selectedLabel = isSelected ? ' selected' : '';
              const detail = truncate(airPlayDeviceDetail(device), Math.max(12, lineWidth - name.length - selectedLabel.length - 5));
              return (
                <Box>
                  <Pointer active={active} />
                  <Text color={active ? accent : undefined} bold={active}>
                    {name}
                  </Text>
                  {isSelected ? <Text color={accent}>{selectedLabel}</Text> : null}
                  <Text color="gray"> · {detail}</Text>
                </Box>
              );
            }}
          />
        ) : (
          <Text color="gray">No receivers discovered.</Text>
        )}
        <Text color={textDim}>
          {canEnterCode ? 'Enter selects · c opens code entry · r refreshes receivers' : 'Enter selects · r refreshes receivers'}
        </Text>
      </Box>
    </Box>
  );
}
