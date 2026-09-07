import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {availableUpdateLabel, VersionIndicator, versionIndicatorWidth} from './VersionIndicator.js';

describe('VersionIndicator', () => {
  it('puts an available version immediately before the installed version', () => {
    const updateCheck = {
      checkedAt: '2026-09-07T12:00:00.000Z',
      currentVersion: '0.2.2',
      latestVersion: '0.3.0',
      updateAvailable: true
    };
    const frame = render(
      <VersionIndicator currentVersion="0.2.2" updateCheck={updateCheck} theme="green" />
    ).lastFrame() ?? '';

    expect(frame).toContain('v0.3.0 available  v0.2.2');
    expect(availableUpdateLabel('0.2.2', updateCheck)).toBe('v0.3.0 available');
    expect(versionIndicatorWidth('0.2.2', updateCheck)).toBe(frame.length);
  });

  it('shows only the installed version when no update is available', () => {
    const frame = render(
      <VersionIndicator
        currentVersion="0.2.2"
        updateCheck={{checkedAt: 'now', currentVersion: '0.2.2', latestVersion: '0.2.2', updateAvailable: false}}
        theme="green"
      />
    ).lastFrame() ?? '';

    expect(frame).toBe('v0.2.2');
  });

  it('does not show a stale persisted notice after the app has been updated', () => {
    const staleCheck = {checkedAt: 'now', currentVersion: '0.2.2', latestVersion: '0.3.0', updateAvailable: true};

    expect(availableUpdateLabel('0.3.0', staleCheck)).toBeUndefined();
  });
});
