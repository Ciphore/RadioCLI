import React from 'react';
import {Box, Text} from 'ink';

const logoSpectrumColors =['#ff4b5c', '#ff9f43', '#ffd166', '#a3e635', '#22c55e', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc'];

function LogoSpectrum(): React.ReactElement {
  return (
    <>
      {logoSpectrumColors.map(color => (
        <Text key={color} color={color}>
          ██
        </Text>
      ))}
    </>
  );
}

export function Logo(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>RADIOCLI</Text>
        <Text>  </Text>
        <LogoSpectrum />
      </Box>
      <Text color="gray">Live public radio from around the world</Text>
    </Box>
  );
}
