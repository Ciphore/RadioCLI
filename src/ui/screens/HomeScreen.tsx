import React from 'react';
import {Box, Text} from 'ink';
import {Logo} from '../components/Logo.js';
import {Menu, Pointer} from '../components/Menu.js';
import {themeAccent} from '../theme.js';
import {homeItems} from '../screen-items.js';
import type {LibraryState, PlaybackState, ThemeName} from '../../types.js';
import {playbackBackendLabel} from '../../player/backend-install.js';

type HomeProps = {
  selected: number;
  theme: ThemeName;
  library: LibraryState;
  playback: PlaybackState;
};

export function HomeScreen({selected, theme, library, playback}: HomeProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Logo />
      <Text>
        Receiver:{' '}
        <Text color={themeAccent(theme)}>{playback.state === 'playing' ? playback.message ?? 'playing' : playback.state}</Text>
        <Text color="gray"> · {playbackBackendLabel(playback.backend)}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={homeItems}
          selected={selected}
          keyFor={item => item.screen}
          render={(item, index, active) => (
            <Box>
              <Pointer active={active} />
              <Text color="gray">{index + 1} </Text>
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {item.label}
              </Text>
              <Text color="gray"> · {item.detail}</Text>
            </Box>
          )}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          {library.recent.length} recent · {library.favorites.length} favorites · {library.imported.length} imported
        </Text>
      </Box>
    </Box>
  );
}
