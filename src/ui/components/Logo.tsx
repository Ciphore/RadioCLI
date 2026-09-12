import React from 'react';
import {Box, Text} from 'ink';
import {textMuted} from '../theme.js';
import {useDisplay} from '../display-context.js';

const logoSpectrumColors =['#ff4b5c', '#ff9f43', '#ffd166', '#a3e635', '#22c55e', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc'];

function LogoSpectrum(): React.ReactElement {
  const {ascii} = useDisplay();
  return (
    <>
      {logoSpectrumColors.map(color => (
        <Text key={color} color={color} aria-hidden>
          {ascii ? '##' : '██'}
        </Text>
      ))}
    </>
  );
}

export function Logo({compact = false, width = 80}: {compact?: boolean; width?: number} = {}): React.ReactElement {
  const {ascii} = useDisplay();
  if (compact) {
    const spectrumColumns = Math.max(1, width - 10);
    const colors = logoSpectrumColors.slice(0, Math.min(logoSpectrumColors.length, spectrumColumns));
    return (
      <Box width={width} overflow="hidden">
        <Text bold>RADIOCLI</Text>
        <Text>  </Text>
        {colors.map(color => <Text key={color} color={color} aria-hidden>{ascii ? '#' : '█'}</Text>)}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>RADIOCLI</Text>
        <Text>  </Text>
        <LogoSpectrum />
      </Box>
      <Text color={textMuted}>Live public radio from around the world</Text>
    </Box>
  );
}
