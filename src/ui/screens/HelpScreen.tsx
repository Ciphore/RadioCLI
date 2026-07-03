import React from 'react';
import {Box, Text} from 'ink';
import type {ThemeName} from '../../types.js';
import {textMuted, themeAccent} from '../theme.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {commandHelp, keyHelpSections} from '../help-content.js';
import {truncate} from '../format.js';

type HelpScreenProps = {
  theme: ThemeName;
  width: number;
};

export function HelpScreen({theme, width}: HelpScreenProps): React.ReactElement {
  const accent = themeAccent(theme);
  const keyColumnWidth = 16;
  const lineWidth = Math.max(28, width - 2);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Help"
        subtitle="Keyboard shortcuts and : commands · b or Esc to close"
        width={width}
        theme={theme}
      />
      <Box marginTop={1} flexDirection="row" gap={4} flexWrap="wrap">
        {keyHelpSections.map(section => (
          <Box key={section.title} flexDirection="column" marginBottom={1}>
            <Text color={accent} bold>
              {section.title}
            </Text>
            {section.entries.map(entry => (
              <Text key={entry.keys}>
                <Text color={accent}>{entry.keys.padEnd(keyColumnWidth)}</Text>
                <Text color={textMuted}>{entry.description}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={accent} bold>
          Commands (press : then type)
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          {commandHelp.map(command => (
            <Text key={command.name} color={textMuted}>
              {truncate(`:${command.name}${command.args ? ` ${command.args}` : ''}`, lineWidth)}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
