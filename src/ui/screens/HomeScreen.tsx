import React from 'react';
import {Box, Text} from 'ink';
import {Logo} from '../components/Logo.js';
import {Menu, Pointer} from '../components/Menu.js';
import {textMuted, themeAccent} from '../theme.js';
import {homeItems} from '../screen-items.js';
import type {LibraryState, ThemeName} from '../../types.js';
import {displayWidth} from '../format.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';

type HomeProps = {
  selected: number;
  theme: ThemeName;
  library: LibraryState;
};

export function HomeScreen({selected, theme, library}: HomeProps): React.ReactElement {
  const {ascii} = useDisplay();
  const summary = `${library.recent.length} recent · ${library.favorites.length} favorites · ${library.imported.length} imported`;
  const titleWidth = Math.max(...homeItems.map(item => displayWidth(item.label))) + 2;
  return (
    <Box flexDirection="column">
      <Logo />
      <Box marginTop={1} flexDirection="column">
        <Menu
          items={homeItems}
          selected={selected}
          keyFor={item => item.screen}
          render={(item, index, active) => (
            <Box>
              <Pointer active={active} />
              <Text color={textMuted}>{index + 1} </Text>
              <Box width={titleWidth}>
                <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                  {item.label}
                </Text>
              </Box>
              <Text color={textMuted}>  {item.detail}</Text>
            </Box>
          )}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={textMuted}>
          {ascii ? toAsciiSafe(summary) : summary}
        </Text>
      </Box>
    </Box>
  );
}
