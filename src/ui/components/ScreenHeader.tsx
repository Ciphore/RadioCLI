import React from 'react';
import {Box, Text} from 'ink';
import type {ThemeName} from '../../types.js';
import {textDim, textMuted, themeAccent} from '../theme.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';
import {truncate} from '../format.js';

type ScreenHeaderProps = {
  title: string;
  width: number;
  theme: ThemeName;
  subtitle?: string;
  right?: string;
};

// One title treatment shared by every screen: an accented, bold title trailed by
// a dim rule that fills the frame, with optional right-aligned meta and a muted
// subtitle below. Renders one row (plus one for the subtitle when present).
export function ScreenHeader({title, width, theme, subtitle, right}: ScreenHeaderProps): React.ReactElement {
  const accent = themeAccent(theme);
  const {ascii} = useDisplay();
  const a = (value: string): string => (ascii ? toAsciiSafe(value) : value);
  const safeTitle = truncate(title, Math.max(4, width - 4));
  const rightText = right ? ` ${right}` : '';
  const ruleWidth = Math.max(1, width - safeTitle.length - rightText.length - 2);
  const rule = (ascii ? '-' : '─').repeat(ruleWidth);

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box>
        <Text color={accent} bold>
          {a(safeTitle)}
        </Text>
        <Text color={textDim}> {rule}</Text>
        {rightText ? <Text color={textMuted}>{a(rightText)}</Text> : null}
      </Box>
      {subtitle ? <Text color={textMuted}>{a(truncate(subtitle, width))}</Text> : null}
    </Box>
  );
}
