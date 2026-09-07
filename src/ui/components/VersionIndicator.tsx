import React from 'react';
import {Box, Text} from 'ink';
import type {ThemeName, UpdateCheckState} from '../../types.js';
import {updateAvailableForVersion} from '../../update-check.js';
import {displayWidth} from '../format.js';
import {appBackground, textDim, themeAccent} from '../theme.js';

type VersionIndicatorProps = {
  currentVersion: string;
  updateCheck?: UpdateCheckState;
  theme: ThemeName;
};

export function availableUpdateLabel(currentVersion: string, updateCheck: UpdateCheckState | undefined): string | undefined {
  return updateAvailableForVersion(updateCheck, currentVersion) && updateCheck?.latestVersion
    ? `v${updateCheck.latestVersion} available`
    : undefined;
}

export function versionIndicatorWidth(currentVersion: string, updateCheck: UpdateCheckState | undefined): number {
  const versionWidth = displayWidth(`v${currentVersion}`);
  const updateLabel = availableUpdateLabel(currentVersion, updateCheck);
  return updateLabel ? displayWidth(updateLabel) + 3 + versionWidth : versionWidth;
}

export function VersionIndicator({currentVersion, updateCheck, theme}: VersionIndicatorProps): React.ReactElement {
  const updateLabel = availableUpdateLabel(currentVersion, updateCheck);
  return (
    <Box flexShrink={0}>
      {updateLabel ? (
        <>
          <Text color={appBackground} backgroundColor={themeAccent(theme)} bold>{` ${updateLabel} `}</Text>
          <Text> </Text>
        </>
      ) : null}
      <Text color={textDim}>{`v${currentVersion}`}</Text>
    </Box>
  );
}
