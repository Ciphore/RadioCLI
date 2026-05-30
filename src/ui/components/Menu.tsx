import React from 'react';
import {Box, Text} from 'ink';

type MenuProps<T> = {
  items: readonly T[];
  selected: number;
  keyFor?: (item: T, index: number) => React.Key;
  render: (item: T, index: number, selected: boolean) => React.ReactNode;
};

export function Menu<T>({items, selected, keyFor, render}: MenuProps<T>): React.ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item, position) => (
        <Box key={keyFor?.(item, position) ?? defaultMenuKey(item)}>
          {render(item, position, position === selected)}
        </Box>
      ))}
    </Box>
  );
}

export function Pointer({active}: {active: boolean}): React.ReactElement {
  return <Text bold={active}>{active ? '> ' : '  '}</Text>;
}

function defaultMenuKey(item: unknown): React.Key {
  if (typeof item === 'string' || typeof item === 'number') {
    return item;
  }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    for (const field of ['id', 'code', 'screen', 'label', 'name']) {
      const value = record[field];
      if (typeof value === 'string' || typeof value === 'number') {
        return `${field}:${value}`;
      }
    }
  }

  return JSON.stringify(item);
}
