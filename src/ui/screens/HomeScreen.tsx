import React from 'react';
import {Box, Text} from 'ink';
import {Logo} from '../components/Logo.js';
import {Menu, Pointer} from '../components/Menu.js';
import {themeAccent} from '../theme.js';
import type {LibraryState, PlaybackState, ThemeName} from '../../types.js';

export const homeItems = [
  {screen: 'explore', label: 'Explore world', detail: 'Popular live stations across countries'},
  {screen: 'map', label: 'World map', detail: 'Station-density atlas by country'},
  {screen: 'countries', label: 'Countries', detail: 'Browse by country list'},
  {screen: 'search', label: 'Search stations', detail: 'Find stations by name, genre, language, place'},
  {screen: 'nearby', label: 'Nearby', detail: 'Opt-in approximate location for local stations'},
  {screen: 'now-playing', label: 'Now playing', detail: 'Receiver display and controls'},
  {screen: 'recent', label: 'Recent', detail: 'Stations played on this machine'},
  {screen: 'favorites', label: 'Favorites', detail: 'Saved and imported stations'},
  {screen: 'settings', label: 'Settings', detail: 'Playback backend, colors, providers'}
] as const;

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
        <Text color="gray"> · {playback.backend}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={homeItems}
          selected={selected}
          render={(item, index, active) => (
            <Box>
              <Pointer active={active} />
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {index + 1}. {item.label}
              </Text>
              <Text color="gray"> · {item.detail}</Text>
            </Box>
          )}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          {library.recent.length} recent · {library.favorites.length} favorites · {library.imported.length} imported · [↑↓ navigate, Enter select, q quit]
        </Text>
      </Box>
    </Box>
  );
}
