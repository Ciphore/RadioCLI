import React from 'react';
import {Box, Text} from 'ink';
import type {Screen, ThemeName} from '../../types.js';
import {panelBackground, panelBorder, themeAccent} from '../theme.js';
import {truncate} from '../format.js';

export type TopTab = {
  screen: Screen;
  label: string;
};

type TopTabsProps = {
  tabs: readonly TopTab[];
  active: Screen;
  theme: ThemeName;
  width: number;
  rightLabel: string;
};

export function TopTabs({tabs, active, theme, width, rightLabel}: TopTabsProps): React.ReactElement {
  const accent = themeAccent(theme);
  const brand = 'RADIOCLI';
  const rightText = ` ${rightLabel} `;
  const bodyWidth = Math.max(1, width - 4);
  const titlePrefixWidth = 2 + brand.length + 1;
  const titleRuleWidth = Math.max(0, width - titlePrefixWidth - 1);
  const allTabsWidth = tabsWidth(tabs.map(tab => ({type: 'tab' as const, tab})));
  const canShowRight = bodyWidth - allTabsWidth - rightText.length >= 1;
  const tabsAvailableWidth = Math.max(1, bodyWidth - (canShowRight ? rightText.length + 1 : 0));
  const visibleTabs = fitTabs(tabs, active, tabsAvailableWidth);
  const visibleTabsWidth = tabsWidth(visibleTabs);
  const tabPaddingWidth = Math.max(0, bodyWidth - visibleTabsWidth - (canShowRight ? rightText.length : 0));

  return (
    <Box flexDirection="column" backgroundColor={panelBackground} width={width}>
      <Text backgroundColor={panelBackground}>
        <Text color={panelBorder}>┌ </Text>
        <Text color={accent} bold>
          {brand}
        </Text>
        <Text color={panelBorder}> {'─'.repeat(titleRuleWidth)}┐</Text>
      </Text>
      <Text backgroundColor={panelBackground}>
        <Text color={panelBorder}>│ </Text>
        {visibleTabs.map((item, index) => (
          <Text key={item.type === 'overflow' ? `${item.side}-overflow` : item.tab.screen}>
            {item.type === 'overflow' ? (
              <Text color="gray">…</Text>
            ) : (
              <Text color={item.tab.screen === active ? accent : 'gray'} bold={item.tab.screen === active}>
                {item.tab.label}
              </Text>
            )}
            {index < visibleTabs.length - 1 ? <Text color="gray"> │ </Text> : null}
          </Text>
        ))}
        <Text>{' '.repeat(tabPaddingWidth)}</Text>
        {canShowRight ? <Text color="gray">{rightText}</Text> : null}
        <Text color={panelBorder}> │</Text>
      </Text>
      <Text backgroundColor={panelBackground} color={panelBorder}>
        └{'─'.repeat(Math.max(0, width - 2))}┘
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
    const labelWidth = segment.type === 'overflow' ? 1 : segment.tab.label.length;
    return total + labelWidth + (index > 0 ? 3 : 0);
  }, 0);
}
