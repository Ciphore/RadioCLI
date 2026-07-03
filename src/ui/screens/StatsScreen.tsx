import React from 'react';
import {Box, Text} from 'ink';
import type {LibraryState, ThemeName} from '../../types.js';
import {computeListeningStats, type DailyListening} from '../../activity/stats.js';
import {panelBorder, textHighlight, textMuted, themeAccent, themeContributionColors} from '../theme.js';
import {panelBorderStyle, useDisplay} from '../display-context.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';

type StatsScreenProps = {
  library: LibraryState;
  theme: ThemeName;
  width: number;
  height: number;
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabelWidth = 5;
const heatmapCellOptions = [
  {cell: '  ', gap: ''},
  {cell: ' ', gap: ''}
] as const;
const compactHeatmapCell = ' ';
const compactHeatmapGap = '';
const tallHeatmapMinHeight = 26;

type ContributionCell = {
  key: string;
  level: number;
  text: string;
  visible: boolean;
};

type ContributionGraph = {
  year: number;
  months: string;
  cellText: string;
  cellGap: string;
  tileHeight: number;
  rows: Array<{key: string; label: string; cells: ContributionCell[]}>;
};

export function StatsScreen({library, theme, width, height}: StatsScreenProps): React.ReactElement {
  const {panel: panelBackground, ascii} = useDisplay();
  const stats = computeListeningStats(library.activity.sessions);
  const contentWidth = Math.max(20, width - 4);
  const graph = buildContributionGraph(stats.days, contentWidth, height);
  const graphColors = themeContributionColors(theme);
  const favorite = stats.favoriteStation?.name ?? 'none yet';
  const totalHours = stats.totalSeconds / 3600;
  const metricWidth = Math.max(28, Math.floor((contentWidth - 2) / 2));
  const favoriteWidth = Math.max(8, metricWidth - 18);
  const compact = height < 30;

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Listening stats"
        subtitle="Local listening history · never leaves this machine"
        width={width}
        theme={theme}
        right={`${formatHours(totalHours)} · ${stats.sessions.toLocaleString()} sessions`}
      />
      <Box
        marginTop={1}
        borderStyle={panelBorderStyle(ascii, 'single')}
        borderColor={panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={width}
        flexDirection="column"
      >
        <Box>
          <Text color={themeAccent(theme)} bold>
            Activity — {graph.year}
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text color={textMuted}>{' '.repeat(dayLabelWidth)}{graph.months}</Text>
          {graph.rows.map(row => (
            <React.Fragment key={row.key}>
              {Array.from({length: graph.tileHeight}, (_, tileLine) => (
                <Box key={`${row.key}-${tileLine}`}>
                  <Text color={textMuted}>{tileLine === 0 ? row.label.padEnd(dayLabelWidth) : ' '.repeat(dayLabelWidth)}</Text>
                  {renderContributionCells(row.cells, graphColors, graph.cellGap)}
                </Box>
              ))}
            </React.Fragment>
          ))}
        </Box>
      </Box>

      <Box
        marginTop={1}
        borderStyle={panelBorderStyle(ascii, 'single')}
        borderColor={panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={width}
        flexDirection="column"
      >
        <Text color={themeAccent(theme)} bold>
          Summary
        </Text>
        <Box marginTop={compact ? 0 : 1} flexDirection="column" width={contentWidth}>
          {metricPair('Favorite station', truncate(favorite, favoriteWidth), 'Total hours listened', formatHours(totalHours), metricWidth, theme)}
          {metricPair('Sessions', stats.sessions.toLocaleString(), 'Longest streak', formatDays(stats.longestStreak), metricWidth, theme)}
          {metricPair('Current streak', formatDays(stats.currentStreak), 'Stations listened', stats.listenedStationCount.toLocaleString(), metricWidth, theme)}
          {metricPair('Active days', `${stats.activeDays}/${stats.totalTrackedDays}`, 'Station threshold', '>= 120s total', metricWidth, theme)}
        </Box>
        <Box marginTop={1}>
          <Text color={textMuted}>Less · </Text>
          {graphColors.map(color => (
            <React.Fragment key={color}>
              {renderLegendCell(color, graph.cellText, graph.cellGap)}
              <Text> </Text>
            </React.Fragment>
          ))}
          <Text color={textMuted}>More</Text>
        </Box>
        {!compact ? (
        <Box marginTop={1}>
          <Text color={textHighlight}>{stats.totalSeconds > 0
            ? `Your total listening time is ${formatHours(totalHours)} across public radio streams.`
            : 'Start a station to begin filling the listening graph.'}
          </Text>
        </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function renderContributionCells(cells: ContributionCell[], graphColors: string[], cellGap: string): React.ReactNode {
  const runs: Array<{key: string; level: number; text: string; visible: boolean}> = [];

  for (const cell of cells) {
    const text = cellGap ? `${cell.text}${cell.visible ? cellGap : ''}` : cell.text;
    const previous = runs[runs.length - 1];
    if (previous && previous.visible === cell.visible && previous.level === cell.level) {
      previous.text += text;
    } else {
      runs.push({
        key: `${runs.length}-${cell.key}`,
        level: cell.level,
        text,
        visible: cell.visible
      });
    }
  }

  return runs.map(run => {
    if (!run.visible) {
      return <Text key={run.key}>{run.text}</Text>;
    }

    const color = graphColors[run.level] ?? graphColors[0] ?? textMuted;
    if (run.text.trim().length === 0) {
      return <Text key={run.key} backgroundColor={color}>{run.text}</Text>;
    }

    return <Text key={run.key} color={color}>{run.text}</Text>;
  });
}

function renderLegendCell(color: string, text: string, cellGap: string): React.ReactElement {
  if (text.trim().length === 0) {
    return (
      <>
        <Text backgroundColor={color}>{text}</Text>
        {cellGap ? <Text>{cellGap}</Text> : null}
      </>
    );
  }

  return (
    <>
      <Text color={color}>{text}</Text>
      {cellGap ? <Text>{cellGap}</Text> : null}
    </>
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
          <Text color={textMuted}>{leftLabel}: </Text>
          <Text color={accent}>{leftValue}</Text>
        </Text>
      </Box>
      <Text>{' '.repeat(leftPadding > 2 ? 2 : leftPadding)}</Text>
      <Box width={metricWidth}>
        <Text>
          <Text color={textMuted}>{rightLabel}: </Text>
          <Text color={accent}>{rightValue}</Text>
        </Text>
      </Box>
    </Box>
  );
}

export function buildContributionGraph(days: DailyListening[], width: number, height = tallHeatmapMinHeight): ContributionGraph {
  const year = graphYear(days);
  const weeks = calendarYearWeeks(year);
  const largestCell = heatmapCellOptions.find(option => dayLabelWidth + weeks.length * (option.cell.length + option.gap.length) <= width);
  const selectedCell = largestCell ?? {cell: compactHeatmapCell, gap: compactHeatmapGap};
  const largeCellWidth = selectedCell.cell.length + selectedCell.gap.length;
  const compactCellWidth = compactHeatmapCell.length + compactHeatmapGap.length;
  const cellWidth = largeCellWidth > 0 ? largeCellWidth : compactCellWidth;
  const cellText = selectedCell.cell;
  const cellGap = selectedCell.gap;
  const tileHeight = cellText.trim().length === 0 && height >= tallHeatmapMinHeight ? 2 : 1;
  const secondsByDate = new Map(days.map(day => [day.date, day.seconds]));
  const yearDays = days.filter(day => parseLocalDay(day.date).getFullYear() === year);
  const scaleSeconds = contributionScaleSeconds(yearDays);
  const labels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  const rows = Array.from({length: 7}, (_, dayIndex) => ({
    key: `day-${dayIndex}`,
    label: labels[dayIndex] ?? '',
    cells: weeks.map(week => {
      const day = week[dayIndex];
      if (!day) {
        return {
          key: `empty-${dayIndex}`,
          level: 0,
          text: ' '.repeat(cellWidth),
          visible: false
        };
      }

      const date = localDay(day.date);
      const level = day.visible ? contributionLevel(secondsByDate.get(date) ?? 0, scaleSeconds) : 0;
      return {key: date, level, text: cellText, visible: true};
    })
  }));

  return {year, months: monthLine(weeks, cellWidth, year), cellText, cellGap, tileHeight, rows};
}

export function contributionScaleSeconds(days: DailyListening[]): number {
  const activeSeconds = days
    .map(day => day.seconds)
    .filter(seconds => seconds > 0)
    .sort((left, right) => left - right);

  if (activeSeconds.length === 0) {
    return 1;
  }

  const percentileIndex = Math.min(activeSeconds.length - 1, Math.ceil(activeSeconds.length * 0.95) - 1);
  return Math.max(1, activeSeconds[percentileIndex] ?? activeSeconds[activeSeconds.length - 1] ?? 1);
}

export function contributionLevel(seconds: number, scaleSeconds: number): number {
  if (seconds <= 0) {
    return 0;
  }

  const ratio = seconds / Math.max(1, scaleSeconds);
  if (ratio >= 0.75) {
    return 4;
  }

  if (ratio >= 0.5) {
    return 3;
  }

  if (ratio >= 0.25) {
    return 2;
  }

  return 1;
}

type CalendarDay = {
  date: Date;
  visible: boolean;
};

function graphYear(days: DailyListening[]): number {
  const lastDay = days[days.length - 1];
  return lastDay ? parseLocalDay(lastDay.date).getFullYear() : new Date().getFullYear();
}

function calendarYearWeeks(year: number): CalendarDay[][] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const gridStart = addLocalDays(yearStart, -yearStart.getDay());
  const gridEnd = addLocalDays(yearEnd, 6 - yearEnd.getDay());
  const weeks: CalendarDay[][] = [];

  for (let cursor = gridStart; cursor.getTime() <= gridEnd.getTime(); cursor = addLocalDays(cursor, 7)) {
    weeks.push(Array.from({length: 7}, (_, dayIndex) => {
      const date = addLocalDays(cursor, dayIndex);
      return {date, visible: date.getFullYear() === year};
    }));
  }

  return weeks;
}

function monthLine(weeks: CalendarDay[][], cellWidth: number, year: number): string {
  const cells = Array.from({length: weeks.length * cellWidth}, () => ' ');

  for (let month = 0; month < 12; month += 1) {
    const label = monthLabels[month]!;
    const firstOfMonth = localDay(new Date(year, month, 1));
    const weekIndex = weeks.findIndex(week => week.some(day => localDay(day.date) === firstOfMonth));
    if (weekIndex < 0) {
      continue;
    }

    const start = weekIndex * cellWidth;
    for (let index = 0; index < label.length && start + index < cells.length; index += 1) {
      cells[start + index] = label[index]!;
    }
  }

  return cells.join('');
}

function parseLocalDay(value: string): Date {
  const [year = '0', month = '1', day = '1'] = value.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
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
