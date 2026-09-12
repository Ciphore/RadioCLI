import React from 'react';
import {Box, Text} from 'ink';
import type {Screen, ThemeName} from '../../types.js';
import {panelBorder, textMuted, themeAccent} from '../theme.js';
import {useDisplay} from '../display-context.js';
import {displayWidth, truncate} from '../format.js';

export type TopTab = {
  screen: Screen;
  label: string;
};

type TopTabsProps = {
  tabs: readonly TopTab[];
  active: Screen;
  theme: ThemeName;
  width: number;
  backendLabel: string;
};

export function TopTabs({tabs, active, theme, width, backendLabel}: TopTabsProps): React.ReactElement {
  const accent = themeAccent(theme);
  const {app: background, ascii} = useDisplay();
  const box = ascii
    ? {tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'}
    : {tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│'};
  const brand = 'RADIOCLI';
  const rightText = ` ${backendLabel} `;
  const bodyWidth = Math.max(1, width - 4);
  const titlePrefixWidth = 2 + brand.length + 1;
  const titleRuleWidth = Math.max(0, width - titlePrefixWidth - 1);
  const allTabsWidth = tabsWidth(tabs.map(tab => ({type: 'tab' as const, tab})));
  const rightWidth = displayWidth(rightText);
  const canShowRight = bodyWidth - allTabsWidth - rightWidth >= 1;
  const tabsAvailableWidth = Math.max(1, bodyWidth - (canShowRight ? rightWidth + 1 : 0));
  const visibleTabs = fitTabs(tabs, active, tabsAvailableWidth);
  const visibleTabsWidth = tabsWidth(visibleTabs);
  const tabPaddingWidth = Math.max(0, bodyWidth - visibleTabsWidth - (canShowRight ? rightWidth : 0));

  return (
    <Box flexDirection="column" backgroundColor={background} width={width} aria-label={`RadioCLI. Tabs: ${tabs.map(tab => `${tab.label}${tab.screen === active ? ' (selected)' : ''}`).join(', ')}. Audio output: ${backendLabel}.`}>
      <Text backgroundColor={background}>
        <Text color={panelBorder}>{box.tl} </Text>
        <Text color={accent} bold>
          {brand}
        </Text>
        <Text color={panelBorder}> {box.h.repeat(titleRuleWidth)}{box.tr}</Text>
      </Text>
      <Text backgroundColor={background}>
        <Text color={panelBorder}>{box.v} </Text>
        {visibleTabs.map((item, index) => (
          <Text key={item.type === 'overflow' ? `${item.side}-overflow` : item.tab.screen}>
            {item.type === 'overflow' ? (
              <Text color={textMuted}>{ascii ? '.' : '…'}</Text>
            ) : (
              <Text color={item.tab.screen === active ? accent : textMuted} bold={item.tab.screen === active}>
                {item.tab.label}
              </Text>
            )}
            {index < visibleTabs.length - 1 ? <Text color={textMuted}> {box.v} </Text> : null}
          </Text>
        ))}
        <Text>{' '.repeat(tabPaddingWidth)}</Text>
        {canShowRight ? <Text color={textMuted}>{rightText}</Text> : null}
        <Text color={panelBorder}> {box.v}</Text>
      </Text>
      <Text backgroundColor={background} color={panelBorder}>
        {box.bl}{box.h.repeat(Math.max(0, width - 2))}{box.br}
      </Text>
    </Box>
  );
}

type TabSegment =
  | {type: 'tab'; tab: TopTab}
  | {type: 'overflow'; side: 'left' | 'right'};

function fitTabs(tabs: readonly TopTab[], active: Screen, maxWidth: number): TabSegment[] {
  const all = tabs.map(tab => ({type: 'tab' as const, tab}));
  if (tabsWidth(all) <= maxWidth) {
    return all;
  }

  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.screen === active));
  let firstIndex = activeIndex;
  let lastIndex = activeIndex;
  let blockedLeft = false;
  let blockedRight = false;

  while (!blockedLeft || !blockedRight) {
    if (!blockedLeft) {
      if (firstIndex === 0) {
        blockedLeft = true;
      } else if (tabsWidth(segmentsForRange(tabs, firstIndex - 1, lastIndex)) <= maxWidth) {
        firstIndex -= 1;
      } else {
        blockedLeft = true;
      }
    }

    if (!blockedRight) {
      if (lastIndex === tabs.length - 1) {
        blockedRight = true;
      } else if (tabsWidth(segmentsForRange(tabs, firstIndex, lastIndex + 1)) <= maxWidth) {
        lastIndex += 1;
      } else {
        blockedRight = true;
      }
    }
  }

  const segments = segmentsForRange(tabs, firstIndex, lastIndex);
  if (tabsWidth(segments) <= maxWidth) {
    return segments;
  }

  const activeTab = tabs[activeIndex] ?? tabs[0]!;
  return [{type: 'tab', tab: {...activeTab, label: truncate(activeTab.label, Math.max(1, maxWidth))}}];
}

function segmentsForRange(tabs: readonly TopTab[], firstIndex: number, lastIndex: number): TabSegment[] {
  const segments: TabSegment[] = [];
  if (firstIndex > 0) {
    segments.push({type: 'overflow', side: 'left'});
  }

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const tab = tabs[index];
    if (tab) {
      segments.push({type: 'tab', tab});
    }
  }

  if (lastIndex < tabs.length - 1) {
    segments.push({type: 'overflow', side: 'right'});
  }

  return segments;
}

function tabsWidth(segments: readonly TabSegment[]): number {
  return segments.reduce((total, segment, index) => {
    const labelWidth = segment.type === 'overflow' ? 1 : displayWidth(segment.tab.label);
    return total + labelWidth + (index > 0 ? 3 : 0);
  }, 0);
}
