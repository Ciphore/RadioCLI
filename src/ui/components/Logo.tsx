import React from 'react';
import {Box, Text} from 'ink';

export function Logo(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="#66d9ef">██</Text>
        <Text color="#a6e22e">██</Text>
        <Text color="#ffd866">██</Text>
        <Text color="#ff6188">██</Text>
        <Text>  </Text>
        <Text bold>RADIO ATLAS</Text>
      </Box>
      <Text color="gray">Live public radio from around the world</Text>
    </Box>
  );
}
