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
import {textDim, textMuted, themeAccent} from '../theme.js';
import {visibleWindow} from '../list-window.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';

type AirPlaySettingsScreenProps = {
  selected: number;
  settings: AppSettings;
  backends: string[];
  devices: AirPlayDevice[];
  theme: ThemeName;
  width: number;
  height?: number;
};

export function AirPlaySettingsScreen({
  selected,
  settings,
  backends,
  devices,
  theme,
  width,
  height
}: AirPlaySettingsScreenProps): React.ReactElement {
  const {ascii} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const accent = themeAccent(theme);
  const availability = airPlayAvailability(backends, devices);
  const selectedDevice = selectedAirPlayDevice(settings, devices);
  const selectedMissing = Boolean(settings.preferredAirPlayDevice && !selectedDevice);
  const canEnterCode = availability.ready && selectedDevice?.requiresPassword && !selectedDevice.local;
  const lineWidth = Math.max(24, width - 4);
  const preferredOutput = audioOutputLabel(settings.preferredBackend);
  const deviceWindow = visibleWindow(devices, selected, height ? Math.max(1, height - 9) : Math.max(1, devices.length));

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
        <Text color={textMuted}>
          Audio output: <Text color={accent}>{preferredOutput}</Text>{a(' · Streaming: ')}
          <Text color={availability.ready ? accent : 'yellow'}>{availability.ready ? 'ready' : 'unavailable'}</Text>{a(' · Receivers: ')}
          <Text color={accent}>{devices.length}</Text>
        </Text>
        <Text color={availability.ready ? textMuted : 'yellow'}>{a(truncate(availability.detail, lineWidth))}</Text>
        <Text color={textMuted}>
          Selected: <Text color={selectedDevice ? accent : textDim}>{a(truncate(selectedDevice?.name ?? 'none', Math.max(4, lineWidth - 10)))}</Text>
        </Text>
        {availability.ready && selectedDevice?.requiresPassword && !selectedDevice.local ? (
          <Text color={textMuted}>
            Code: <Text color={accent}>if the receiver shows a code while tuning, RadioCLI will ask for it</Text>
          </Text>
        ) : null}
        {selectedMissing ? (
          <Text color="yellow">
            Saved receiver is not visible: {a(truncate(settings.preferredAirPlayDevice ?? '', Math.max(8, lineWidth - 31)))}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={textMuted} bold>
          Receivers
        </Text>
        {devices.length > 0 ? (
          <Menu
            items={deviceWindow.items}
            selected={selected - deviceWindow.start}
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
                    {a(name)}
                  </Text>
                  {isSelected ? <Text color={accent}>{selectedLabel}</Text> : null}
                  <Text color={textMuted}>{a(` · ${detail}`)}</Text>
                </Box>
              );
            }}
          />
        ) : (
          <Text color={textMuted}>No receivers discovered.</Text>
        )}
        <Text color={textDim}>
          {a(canEnterCode ? 'Enter selects · c opens code entry · r refreshes receivers' : 'Enter selects · r refreshes receivers')}
        </Text>
      </Box>
    </Box>
  );
}
