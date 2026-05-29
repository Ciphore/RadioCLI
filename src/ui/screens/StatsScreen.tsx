import React from 'react';
import {Box, Text} from 'ink';
import type {LibraryState, ThemeName} from '../../types.js';
import {computeListeningStats, type DailyListening} from '../../activity/stats.js';
import {panelBackground, panelBorder, themeAccent, themeContributionColors} from '../theme.js';
import {truncate} from '../format.js';

type StatsScreenProps = {
  library: LibraryState;
  theme: ThemeName;
  width: number;
  height: number;
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function StatsScreen({library, theme, width, height}: StatsScreenProps): React.ReactElement {
  const stats = computeListeningStats(library.activity.sessions);
  const contentWidth = Math.max(20, width - 4);
  const graph = buildContributionGraph(stats.days, contentWidth);
  const graphColors = themeContributionColors(theme);
  const favorite = stats.favoriteStation?.name ?? 'none yet';
  const totalHours = stats.totalSeconds / 3600;
  const metricWidth = Math.max(28, Math.floor((contentWidth - 2) / 2));
  const favoriteWidth = Math.max(8, metricWidth - 18);
  const compact = height < 30;

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="single"
        borderColor={panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={width}
        flexDirection="column"
      >
        <Box>
          <Text color={themeAccent(theme)} bold>
            Contribution Graph (52 weeks)
          </Text>
        </Box>
        <Box marginTop={compact ? 0 : 1} flexDirection="column">
          <Text color="gray">      {graph.months}</Text>
          {graph.rows.map(row => (
            <Box key={row.key}>
              <Text color="gray">{row.label.padEnd(5)}</Text>
              {row.cells.map(cell => (
                <Text key={cell.key} color={graphColors[cell.level]}>
                  {cell.text}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={width}
        flexDirection="column"
      >
        <Text color={themeAccent(theme)} bold>
          Stats
        </Text>
        <Box marginTop={compact ? 0 : 1} flexDirection="column" width={contentWidth}>
          {metricPair('Favorite station', truncate(favorite, favoriteWidth), 'Total hours listened', formatHours(totalHours), metricWidth, theme)}
          {metricPair('Sessions', stats.sessions.toLocaleString(), 'Longest streak', formatDays(stats.longestStreak), metricWidth, theme)}
          {metricPair('Current streak', formatDays(stats.currentStreak), 'Stations listened', stats.listenedStationCount.toLocaleString(), metricWidth, theme)}
          {metricPair('Active days', `${stats.activeDays}/${stats.totalTrackedDays}`, 'Station threshold', '>= 120s total', metricWidth, theme)}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Less · </Text>
          {graphColors.map((color, index) => (
            <Text key={color} color={color}>
              {index === 0 ? '██' : '██'}
              <Text> </Text>
            </Text>
          ))}
          <Text color="gray">More</Text>
        </Box>
        {!compact ? (
        <Box marginTop={1}>
          <Text color="#d8c66f">{stats.totalSeconds > 0
            ? `Your total listening time is ${formatHours(totalHours)} across public radio streams.`
            : 'Start a station to begin filling the listening graph.'}
          </Text>
        </Box>
        ) : null}
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={width}
        flexDirection="column"
      >
        <Box justifyContent="space-between" width={contentWidth}>
          <Text color="gray">Activity: last 371 days · local only</Text>
          <Text>
            <Text color={themeAccent(theme)}>{formatHours(totalHours)}</Text>
            <Text color="gray"> listened | </Text>
            <Text color={themeAccent(theme)}>{stats.sessions.toLocaleString()} sessions</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function metricPair(
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  metricWidth: number,
  theme: ThemeName
): React.ReactElement {
  const accent = themeAccent(theme);
  const leftPadding = Math.max(2, metricWidth - leftLabel.length - leftValue.length - 2);
  return (
    <Box height={1} width={metricWidth * 2 + 2}>
      <Box width={metricWidth}>
        <Text>
          <Text color="gray">{leftLabel}: </Text>
          <Text color={accent}>{leftValue}</Text>
        </Text>
      </Box>
      <Text>{' '.repeat(leftPadding > 2 ? 2 : leftPadding)}</Text>
      <Box width={metricWidth}>
        <Text>
          <Text color="gray">{rightLabel}: </Text>
          <Text color={accent}>{rightValue}</Text>
        </Text>
      </Box>
    </Box>
  );
}

function buildContributionGraph(days: DailyListening[], width: number): {
  months: string;
  rows: Array<{key: string; label: string; cells: Array<{key: string; level: number; text: string}>}>;
} {
  const cellWidth = width >= 168 ? 3 : width >= 120 ? 2 : 1;
  const weeks = Array.from({length: 53}, (_, weekIndex) =>
    days.slice(weekIndex * 7, weekIndex * 7 + 7)
  ).filter(week => week.length > 0);
  const maxSeconds = Math.max(1, ...days.map(day => day.seconds));
  const labels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  const rows = Array.from({length: 7}, (_, dayIndex) => ({
    key: `day-${dayIndex}`,
    label: labels[dayIndex] ?? '',
    cells: weeks.map(week => {
      const day = week[dayIndex];
      const level = contributionLevel(day?.seconds ?? 0, maxSeconds);
      return {key: day?.date ?? `${week[0]?.date ?? 'empty'}-${dayIndex}`, level, text: '█'.repeat(cellWidth)};
    })
  }));

  return {months: monthLine(weeks, cellWidth), rows};
}

function contributionLevel(seconds: number, maxSeconds: number): number {
  if (seconds <= 0) {
    return 0;
  }

  const ratio = seconds / maxSeconds;
  if (ratio > 0.75) {
    return 4;
  }

  if (ratio > 0.45) {
    return 3;
  }

  if (ratio > 0.2) {
    return 2;
  }

  return 1;
}

function monthLine(weeks: DailyListening[][], cellWidth: number): string {
  const cells = weeks.map((week, index) => {
    const first = week[0];
    if (!first) {
      return ''.padEnd(cellWidth, ' ');
    }

    const date = parseLocalDay(first.date);
    const previous = index > 0 && weeks[index - 1]?.[0]
      ? parseLocalDay(weeks[index - 1]![0]!.date)
      : null;
    const changedMonth = !previous || date.getMonth() !== previous.getMonth();
    if (!changedMonth) {
      return ''.padEnd(cellWidth, ' ');
    }

    const label = monthLabels[date.getMonth()]!;
    return cellWidth >= 3 ? label : label.slice(0, cellWidth).padEnd(cellWidth, ' ');
  });

  return cells.join('');
}

function parseLocalDay(value: string): Date {
  const [year = '0', month = '1', day = '1'] = value.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function formatHours(hours: number): string {
  if (hours < 10) {
    return `${hours.toFixed(1)}h`;
  }

  return `${Math.round(hours).toLocaleString()}h`;
}
