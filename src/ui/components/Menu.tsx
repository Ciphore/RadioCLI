import React from 'react';
import {Box, Text} from 'ink';

type MenuProps<T> = {
  items: readonly T[];
  selected: number;
  render: (item: T, index: number, selected: boolean) => React.ReactNode;
};

export function Menu<T>({items, selected, render}: MenuProps<T>): React.ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Box key={index}>
          {render(item, index, index === selected)}
        </Box>
      ))}
    </Box>
  );
}

export function Pointer({active}: {active: boolean}): React.ReactElement {
  return <Text bold={active}>{active ? '> ' : '  '}</Text>;
}
