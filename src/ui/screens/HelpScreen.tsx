import React from 'react';
import {Box, Text} from 'ink';
import type {ThemeName} from '../../types.js';
import {textMuted, themeAccent} from '../theme.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {commandHelp, keyHelpSections} from '../help-content.js';
import {padDisplayEnd, truncate} from '../format.js';
import {visibleWindow} from '../list-window.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';

type HelpScreenProps = {
  theme: ThemeName;
  width: number;
  height: number;
  selected: number;
};

type HelpRow = {key: string; heading?: string; keys?: string; description?: string};

export function HelpScreen({theme, width, height, selected}: HelpScreenProps): React.ReactElement {
  const {ascii} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const accent = themeAccent(theme);
  const keyColumnWidth = 16;
  const lineWidth = Math.max(28, width - 2);
  const rows: HelpRow[] = [
    ...keyHelpSections.flatMap(section => [
      {key: `section-${section.title}`, heading: section.title},
      ...section.entries.map(entry => ({key: `${section.title}-${entry.keys}`, ...entry}))
    ]),
    {key: 'commands', heading: 'Commands (press : then type)'},
    ...commandHelp.map(command => ({
      key: `command-${command.name}`,
      keys: `:${command.name}${command.args ? ` ${command.args}` : ''}`,
      description: command.description
    }))
  ];
  const window = visibleWindow(rows, selected, Math.max(3, height - 4));

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <ScreenHeader
        title="Help"
        subtitle="Keyboard shortcuts and : commands · b or Esc to close"
        width={width}
        theme={theme}
      />
      <Box marginTop={1} flexDirection="column">
        {window.items.map(row => row.heading ? (
          <Text key={row.key} color={accent} bold>{row.heading}</Text>
        ) : (
          <Text key={row.key}>
            <Text color={accent}>{a(padDisplayEnd(truncate(row.keys ?? '', keyColumnWidth - 1), keyColumnWidth))}</Text>
            <Text color={textMuted}>{a(truncate(row.description ?? '', Math.max(1, lineWidth - keyColumnWidth)))}</Text>
          </Text>
        ))}
      </Box>
      <Text color={textMuted}>{a(`Showing ${window.start + 1}-${window.end} of ${rows.length} · ↑/↓ scroll`)}</Text>
    </Box>
  );
}
