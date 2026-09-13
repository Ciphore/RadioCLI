import {describe, expect, it} from 'vitest';
import {identifyPlatform, type PlatformProfile} from './runtime.js';
import {assessPlatformSupport, type PlatformSupportEvidence} from './support.js';

function host(platform: string, arch = 'x64', overrides: Partial<PlatformProfile> = {}): PlatformProfile {
  const release = platform === 'darwin' ? '23.6.0' : platform === 'win32' ? '10.0.26100' : '6.12.0';
  return {...identifyPlatform({platform, arch, armVersion: null, release, nodeVersion: '22.23.2', endianness: arch === 's390x' ? 'BE' : 'LE', libc: platform === 'linux' ? 'glibc' : 'none', env: {}, osRelease: ''}), ...overrides};
}

const verified: PlatformSupportEvidence = {
  nativeRuntimeVerified: true,
  packedInstallVerified: true,
  playbackVerified: true,
  requiredCi: true
};

describe('platform runtime eligibility', () => {
  it.each([
    ['darwin', 'x64', '20.0.0', 22, 'tier-1'],
    ['darwin', 'arm64', '22.6.0', 24, 'tier-1'],
    ['win32', 'x64', '10.0.19045', 22, 'tier-1'],
    ['win32', 'x64', '10.0.26100', 24, 'tier-1'],
    ['win32', 'arm64', '10.0.26100', 22, 'tier-2'],
    ['win32', 'arm64', '10.0.26100', 24, 'tier-2'],
    ['win32', 'ia32', '10.0.19045', 22, 'tier-1']
  ] as const)('records %s/%s kernel %s with Node %s independently of project evidence', (platform, arch, release, nodeMajor, upstream) => {
    const result = assessPlatformSupport(host(platform, arch, {release, nodeVersion: `${nodeMajor}.20.0`, nodeMajor}));
    expect(result.runtime).toMatchObject({status: 'eligible', upstream});
    expect(result.tier).toBe('experimental');
  });

  it.each([
    ['darwin', 'x64', '19.6.0', 22, 'macOS 11'],
    ['darwin', 'arm64', '22.5.0', 24, 'macOS 13.5'],
    ['darwin', 'ia32', '23.6.0', 22, '32-bit'],
    ['win32', 'ia32', '10.0.19045', 24, 'Node.js 22'],
    ['win32', 'x64', '6.1.7601', 22, 'Windows 10']
  ] as const)('diagnoses a blocked %s/%s runtime', (platform, arch, release, nodeMajor, reason) => {
    const result = assessPlatformSupport(host(platform, arch, {release, nodeVersion: `${nodeMajor}.20.0`, nodeMajor}), verified);
    expect(result).toMatchObject({tier: 'unsupported', runtime: {status: 'unsupported'}});
    expect(result.reasons.join(' ')).toContain(reason);
  });

  it.each(['', 'unknown', '22'])('does not turn an incomplete Darwin release %j into a blocked runtime', release => {
    const result = assessPlatformSupport(host('darwin', 'arm64', {release, nodeVersion: '24.20.0', nodeMajor: 24}));
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified'}});
    expect(result.runtime.reasons.join(' ')).toContain('Darwin');
  });

  it('reads Darwin kernel versions rather than comparing them directly to macOS versions', () => {
    const old = host('darwin', 'x64', {release: '13.5.0', nodeVersion: '24.20.0', nodeMajor: 24});
    expect(assessPlatformSupport(old).runtime.status).toBe('unsupported');
    expect(assessPlatformSupport({...old, release: '22.6.0'}).runtime.status).toBe('eligible');
  });

  it.each([
    ['win32', 'ia32', 24], ['darwin', 'ia32', 22], ['aix', 'ppc64', 22]
  ] as const)('does not lose a known %s/%s runtime exclusion when the OS release is missing', (platform, arch, nodeMajor) => {
    expect(assessPlatformSupport(host(platform, arch, {release: '', nodeVersion: `${nodeMajor}.20.0`, nodeMajor}), verified)).toMatchObject({
      tier: 'unsupported', runtime: {status: 'unsupported'}
    });
  });

  it.each(['linux', 'win32', 'freebsd', 'netbsd', 'openbsd'])(
    'keeps an unknown %s OS release unverified without an independent runtime blocker', platform => {
      expect(assessPlatformSupport(host(platform, 'x64', {release: ''}))).toMatchObject({
        tier: 'experimental', runtime: {status: 'unverified'}
      });
    }
  );

  it.each([
    ['x64', 22, 'tier-1'], ['x64', 24, 'tier-1'],
    ['arm64', 22, 'tier-1'], ['arm64', 24, 'tier-1'],
    ['armv7l', 22, 'tier-1'], ['armv7l', 24, 'experimental'],
    ['ppc64', 22, 'tier-2'], ['ppc64', 24, 'tier-2'],
    ['s390x', 22, 'tier-2'], ['s390x', 24, 'tier-2'],
    ['riscv64', 24, 'experimental'], ['ia32', 24, 'experimental']
  ] as const)('assesses glibc Linux %s on Node %s', (arch, nodeMajor, upstream) => {
    const result = assessPlatformSupport(host('linux', arch, {nodeVersion: `${nodeMajor}.20.0`, nodeMajor}));
    expect(result.runtime).toMatchObject({status: 'eligible', upstream});
    expect(result.tier).toBe('experimental');
    expect(result.runtime.reasons.join(' ')).toContain('glibc');
  });

  it('requires the ARM ISA revision before calling generic arm an upstream ARMv7 target', () => {
    const result = assessPlatformSupport(host('linux', 'arm'));
    expect(result.runtime.status).toBe('unverified');
    expect(result.runtime.reasons.join(' ')).toContain('ARMv7');
  });

  it('uses an explicitly reported ARMv7 ISA while leaving older ARM unverified', () => {
    expect(assessPlatformSupport(host('linux', 'arm', {armVersion: 7})).runtime).toMatchObject({status: 'eligible', upstream: 'tier-1'});
    expect(assessPlatformSupport(host('linux', 'arm', {armVersion: 6})).runtime.status).toBe('unverified');
    expect(assessPlatformSupport(host('linux', 'arm', {armVersion: 7, nodeVersion: '24.20.0', nodeMajor: 24})).runtime.upstream).toBe('experimental');
  });

  it.each(['amd64', 'x86_64', 'aarch64', 'armv7', 'ppc64le', 'i386', 'i686'])(
    'recognizes the explicit architecture spelling %s', arch => {
      expect(assessPlatformSupport(host('linux', arch)).runtime.status).toBe('eligible');
    }
  );

  it.each([22, 24])('keeps big-endian Linux ppc64 separate from ppc64le on Node %s', nodeMajor => {
    const base = host('linux', 'ppc64', {nodeVersion: `${nodeMajor}.20.0`, nodeMajor});
    expect(assessPlatformSupport(base).runtime.upstream).toBe('tier-2');
    const result = assessPlatformSupport({...base, endianness: 'BE'});
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified'}});
    expect(result.runtime.reasons.join(' ')).toContain('big-endian');
  });

  it('leaves conflicting POWER endianness and unknown 32-bit POWER ports unverified', () => {
    expect(assessPlatformSupport(host('linux', 'ppc64le', {endianness: 'BE'})).runtime.status).toBe('unverified');
    expect(assessPlatformSupport(host('linux', 'ppc', {endianness: 'BE'})).runtime.status).toBe('unverified');
  });

  it.each([
    ['x64', 22, 'experimental'], ['x64', 24, 'experimental'],
    ['arm64', 22, 'community'], ['arm64', 24, 'community'],
    ['armv7l', 22, 'community'], ['s390x', 24, 'community']
  ] as const)('does not borrow glibc support for musl %s on Node %s', (arch, nodeMajor, upstream) => {
    const result = assessPlatformSupport(host('linux', arch, {libc: 'musl', nodeVersion: `${nodeMajor}.20.0`, nodeMajor}));
    expect(result.runtime).toMatchObject({status: 'eligible', upstream});
    expect(result.tier).toBe('experimental');
    expect(result.runtime.reasons.join(' ')).toContain('musl');
  });

  it.each([
    {libc: 'unknown'}, {libc: 'bionic'}, {release: ''}, {release: '3.10.0'},
    {arch: 'riscv64'}, {arch: 'future-cpu'}, {arch: 'armv7l', libc: 'musl', nodeVersion: '24.20.0', nodeMajor: 24}
  ] satisfies Partial<PlatformProfile>[])('leaves incomplete Linux runtime evidence unverified: %j', overrides => {
    const result = assessPlatformSupport(host('linux', 'x64', overrides));
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified'}});
    expect(result.runtime.reasons.length).toBeGreaterThan(0);
  });

  it('keeps WSL separate from upstream native Linux support', () => {
    const result = assessPlatformSupport(host('linux', 'x64', {isWsl: true}));
    expect(result.runtime).toMatchObject({status: 'unverified', upstream: 'community'});
    expect(result.runtime.reasons.join(' ')).toContain('WSL');
  });

  it.each([
    ['freebsd', 'x64', 'experimental'], ['freebsd', 'arm64', 'community'],
    ['freebsd', 'ppc64', 'community'], ['openbsd', 'x64', 'community'],
    ['openbsd', 'arm64', 'community'], ['openbsd', 'riscv64', 'community'],
    ['netbsd', 'x64', 'community'], ['netbsd', 'arm64', 'community']
  ] as const)('recognizes a community %s/%s route without claiming a native RadioCLI run', (platform, arch, upstream) => {
    const result = assessPlatformSupport(host(platform, arch, {release: platform === 'freebsd' ? '14.4-RELEASE' : '11.0'}));
    expect(result.runtime).toMatchObject({status: 'eligible', upstream});
    expect(result.tier).toBe('experimental');
    expect(result.evidence.nativeRuntimeVerified).toBe(false);
  });

  it('does not infer a FreeBSD RISC-V Node port from the availability of a VM image', () => {
    expect(assessPlatformSupport(host('freebsd', 'riscv64', {release: '15.1-RELEASE'}))).toMatchObject({
      tier: 'experimental', runtime: {status: 'unverified'}
    });
  });

  it('does not hard-block a community FreeBSD port below the upstream experimental baseline', () => {
    expect(assessPlatformSupport(host('freebsd', 'x64', {release: '13.1-RELEASE'}))).toMatchObject({
      tier: 'experimental', runtime: {status: 'unverified'}
    });
  });

  it.each(['freebsd', 'openbsd', 'netbsd'])('keeps the %s port on Node 24 eligible but experimentally supported without evidence', platform => {
    expect(assessPlatformSupport(host(platform, 'x64', {release: '14.4', nodeVersion: '24.20.0', nodeMajor: 24}))).toMatchObject({
      tier: 'experimental', runtime: {status: 'eligible'}
    });
  });

  it.each(['android', 'linux'])('recognizes Termux on %s as a separate Bionic community route', platform => {
    const profile = identifyPlatform({platform, arch: 'arm64', nodeVersion: '24.20.0', release: '6.6.0', env: {TERMUX_VERSION: '0.118.3'}});
    const result = assessPlatformSupport(profile);
    expect(result.runtime).toMatchObject({status: 'eligible', upstream: 'community'});
    expect(result.runtime.reasons.join(' ')).toContain('Bionic');
    expect(result.tier).toBe('experimental');
  });

  it('leaves Android outside Termux unverified', () => {
    expect(assessPlatformSupport(host('android', 'arm64'))).toMatchObject({tier: 'experimental', runtime: {status: 'unverified'}});
  });

  it('blocks Haiku with its usual Node 20 runtime but leaves a newer custom port experimental', () => {
    const haiku = host('haiku', 'x64', {nodeVersion: '20.15.1', nodeMajor: 20});
    expect(assessPlatformSupport(haiku)).toMatchObject({tier: 'unsupported', runtime: {status: 'unsupported'}});
    const custom = assessPlatformSupport({...haiku, nodeVersion: '22.23.2', nodeMajor: 22});
    expect(custom).toMatchObject({tier: 'experimental', runtime: {status: 'unverified', upstream: 'community'}});
    expect(custom.runtime.reasons.join(' ')).toContain('Haiku');
  });

  it('does not identify generic SunOS release 5.11 as a verified SmartOS distribution', () => {
    const result = assessPlatformSupport(host('sunos', 'x64', {release: '5.11'}));
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified', upstream: 'community'}});
    expect(result.runtime.reasons.join(' ')).toContain('SmartOS');
    expect(result.runtime.reasons.join(' ')).toContain('illumos');
  });

  it('recognizes AIX big-endian POWER without treating uname release as a full AIX version', () => {
    const result = assessPlatformSupport(host('aix', 'ppc64', {endianness: 'BE', release: '3'}));
    expect(result.runtime).toMatchObject({status: 'eligible', upstream: 'tier-2'});
    expect(result.tier).toBe('experimental');
    expect(result.runtime.reasons.join(' ')).toContain('7.2 TL04');
  });

  it('diagnoses a little-endian AIX architecture mismatch', () => {
    const result = assessPlatformSupport(host('aix', 'ppc64', {endianness: 'LE', release: '3'}));
    expect(result).toMatchObject({tier: 'unsupported', runtime: {status: 'unsupported'}});
    expect(result.runtime.reasons.join(' ')).toContain('big-endian');
  });

  it('keeps unknown operating systems and architectures visible', () => {
    const result = assessPlatformSupport(host('future-os', 'future-cpu'));
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified', upstream: 'unverified'}});
    expect(result.runtime.reasons.join(' ')).toContain('future-os/future-cpu');
  });

  it.each([18, 20, 21])('blocks Node %s before considering any platform or evidence', nodeMajor => {
    const result = assessPlatformSupport(host('linux', 'x64', {nodeVersion: `${nodeMajor}.0.0`, nodeMajor}), verified);
    expect(result).toMatchObject({tier: 'unsupported', runtime: {status: 'unsupported'}});
    expect(result.reasons.join(' ')).toContain('Node.js 22 or newer');
  });

  it.each(['unknown', '22broken', '26.8.1'])('does not borrow a Node 22/24 policy for %s', nodeVersion => {
    const result = assessPlatformSupport(host('linux', 'x64', {nodeVersion, nodeMajor: Number.parseInt(nodeVersion, 10)}));
    expect(result).toMatchObject({tier: 'experimental', runtime: {status: 'unverified'}});
  });
});

describe('project support evidence', () => {
  it('never promotes a familiar platform from its identity alone', () => {
    const result = assessPlatformSupport(host('darwin', 'arm64'));
    expect(result.tier).toBe('experimental');
    expect(result.evidence).toEqual({nativeRuntimeVerified: false, packedInstallVerified: false, playbackVerified: false, requiredCi: false});
    expect(result.reasons.join(' ')).toContain('not been verified');
  });

  it.each(['nativeRuntimeVerified', 'packedInstallVerified', 'playbackVerified'] as const)('requires %s even when every other evidence item is supplied', missing => {
    const result = assessPlatformSupport(host('linux'), {...verified, [missing]: false});
    expect(result.tier).toBe('experimental');
  });

  it('promotes verified runtime, packed install, and playback to supported', () => {
    const result = assessPlatformSupport(host('freebsd', 'x64', {release: '14.4-RELEASE'}), {...verified, requiredCi: false});
    expect(result.tier).toBe('supported');
    expect(result.runtime.upstream).toBe('experimental');
    expect(result.reasons.join(' ')).toContain('required CI');
  });

  it('requires ongoing required CI for first-class support', () => {
    const result = assessPlatformSupport(host('win32', 'arm64'), verified);
    expect(result.tier).toBe('first-class');
    expect(result.runtime.upstream).toBe('tier-2');
  });

  it('allows actual project verification to establish support for a custom port independently of its upstream status', () => {
    const result = assessPlatformSupport(host('haiku'), {...verified, requiredCi: false});
    expect(result.tier).toBe('supported');
    expect(result.runtime).toMatchObject({status: 'unverified', upstream: 'community'});
  });

  it('does not infer missing evidence from a required CI flag', () => {
    expect(assessPlatformSupport(host('linux'), {requiredCi: true}).tier).toBe('experimental');
  });

  it('copies supplied evidence without mutating the caller or retaining its object', () => {
    const input = {...verified};
    const result = assessPlatformSupport(host('linux'), input);
    expect(input).toEqual(verified);
    input.playbackVerified = false;
    expect(result.evidence.playbackVerified).toBe(true);
  });
});
