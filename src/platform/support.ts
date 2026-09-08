import {identifyPlatform, type PlatformProfile} from './runtime.js';

type SupportTier = 'first-class' | 'supported' | 'experimental' | 'unsupported';
type RuntimeStatus = 'eligible' | 'unverified' | 'unsupported';
type UpstreamSupport = 'tier-1' | 'tier-2' | 'experimental' | 'community' | 'unverified' | 'unsupported';

/** Evidence must describe this OS, architecture, libc, and Node release line. */
export type PlatformSupportEvidence = {
  /** A real target runtime was exercised; mocks and foreign-CPU emulation do not establish this. */
  nativeRuntimeVerified: boolean;
  /** The packed npm artifact was installed and exercised on the target. */
  packedInstallVerified: boolean;
  /** Playback was exercised; discovering an executable or a release asset is insufficient. */
  playbackVerified: boolean;
  /** The verified target is covered by required, maintained CI. */
  requiredCi: boolean;
};

type RuntimeAssessment = {
  /** Eligibility for a known runtime route, not proof that RadioCLI was executed. */
  status: RuntimeStatus;
  upstream: UpstreamSupport;
  reasons: string[];
};

export type PlatformSupportAssessment = {
  tier: SupportTier;
  runtime: RuntimeAssessment;
  reasons: string[];
  evidence: PlatformSupportEvidence;
};

/**
 * Runtime policy and project evidence are deliberately independent. Catalogs,
 * platform mocks, containers, and downloaded artifacts never supply evidence.
 * This checks the Node 22/24 reference matrix; other newer lines remain unverified.
 * OS vendor lifecycle, CPU instruction levels, libc versions, and audio services
 * require separate checks when the profile does not contain those facts.
 *
 * Reference policy (checked 2026-09-07):
 * https://github.com/nodejs/node/blob/v22.x/BUILDING.md#platform-list
 * https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list
 */
export function assessPlatformSupport(
  host: PlatformProfile = identifyPlatform(),
  suppliedEvidence: Partial<PlatformSupportEvidence> = {}
): PlatformSupportAssessment {
  const evidence: PlatformSupportEvidence = {
    nativeRuntimeVerified: suppliedEvidence.nativeRuntimeVerified === true,
    packedInstallVerified: suppliedEvidence.packedInstallVerified === true,
    playbackVerified: suppliedEvidence.playbackVerified === true,
    requiredCi: suppliedEvidence.requiredCi === true
  };
  const runtime = assessRuntime(host);
  const reasons = [...runtime.reasons];
  let tier: SupportTier = 'experimental';

  if (runtime.status === 'unsupported') {
    tier = 'unsupported';
  } else if (evidence.nativeRuntimeVerified && evidence.packedInstallVerified && evidence.playbackVerified) {
    tier = evidence.requiredCi ? 'first-class' : 'supported';
    reasons.push(evidence.requiredCi
      ? 'Native runtime, packed installation, and playback are verified with required CI coverage.'
      : 'Native runtime, packed installation, and playback are verified; required CI coverage is not established.');
  } else {
    if (!evidence.nativeRuntimeVerified) reasons.push('Native runtime execution has not been verified.');
    if (!evidence.packedInstallVerified) reasons.push('Packed npm installation has not been verified.');
    if (!evidence.playbackVerified) reasons.push('Playback has not been verified.');
  }

  return {tier, runtime, reasons, evidence};
}

function assessRuntime(host: PlatformProfile): RuntimeAssessment {
  const node = /^(\d+)\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(host.nodeVersion);
  if (!node) return assessment('unverified', 'unverified', `Cannot assess the Node.js version ${JSON.stringify(host.nodeVersion)}.`);
  const major = Number(node[1]);
  if (!Number.isSafeInteger(major)) return assessment('unverified', 'unverified', 'The Node.js major version is not recognized.');
  if (major < 22) return assessment('unsupported', 'unsupported', `RadioCLI requires Node.js 22 or newer; this runtime is ${host.nodeVersion}.`);
  if (major !== 22 && major !== 24) {
    return assessment('unverified', 'unverified', `Node.js ${major} meets the package minimum, but its platform requirements are outside the verified Node.js 22/24 reference matrix.`);
  }

  const arch = host.arch === 'arm' && host.armVersion === 7 ? 'armv7' : architecture(host.arch);
  if (host.id === 'darwin' && arch === 'ia32') return assessment('unsupported', 'unsupported', 'Node.js 22/24 do not provide a 32-bit macOS runtime; use Intel x64 or Apple Silicon arm64.');
  if (host.id === 'win32' && major === 24 && arch === 'ia32') return assessment('unsupported', 'unsupported', 'Node.js 24 has no Windows x86 runtime; use Node.js 22 for ia32 or a native x64/arm64 runtime.');
  if (host.id === 'aix' && (arch === 'ppc64' || arch === 'ppc64le') && (host.endianness !== 'BE' || arch === 'ppc64le')) {
    return assessment('unsupported', 'unsupported', 'The AIX Node.js runtime requires big-endian ppc64; a little-endian POWER profile is incompatible.');
  }
  const version = releaseVersion(host.release);
  if (!version) {
    return assessment('unverified', 'unverified', `${host.id === 'darwin' ? 'Darwin' : host.platform} release is unavailable or unrecognized; runtime eligibility needs the OS version.`);
  }

  switch (host.id) {
    case 'darwin':
      if (!['x64', 'arm64'].includes(arch)) return unknownArchitecture(host);
      // os.release() is the Darwin kernel: Darwin 20 = macOS 11,
      // Darwin 22.6 = macOS 13.5. It is not a macOS product-version string.
      if (version.length < 2) return assessment('unverified', 'tier-1', 'A complete Darwin kernel release is needed to check the macOS runtime minimum.');
      if (olderThan(version, major === 22 ? [20, 0] : [22, 6])) {
        return assessment('unsupported', 'unsupported', `Node.js ${major} requires ${major === 22 ? 'macOS 11 (Darwin 20)' : 'macOS 13.5 (Darwin 22.6)'} or newer.`);
      }
      return assessment('eligible', 'tier-1', `The Darwin kernel meets the Node.js ${major} macOS binary minimum for ${arch}.`);
    case 'win32':
      if (!['x64', 'arm64', 'ia32'].includes(arch)) return unknownArchitecture(host);
      if (version.length < 2) return assessment('unverified', 'unverified', 'A complete Windows kernel version is needed to check the Windows 10 minimum.');
      if (olderThan(version, [10, 0])) return assessment('unsupported', 'unsupported', 'The standard Node.js 22/24 Windows runtime requires Windows 10 / Server 2016 or newer.');
      return assessment('eligible', arch === 'arm64' ? 'tier-2' : 'tier-1', arch === 'ia32'
        ? 'Node.js 22 provides Windows x86 binaries; upstream tests run under WoW64, which does not establish native 32-bit Windows verification.'
        : `Node.js ${major} provides a Windows ${arch} runtime; the kernel version alone does not distinguish Windows desktop and Server editions.`);
    case 'linux':
      return linuxRuntime(host, arch, major, version);
    case 'freebsd':
      // Port allowlists are not evidence that every release/CPU binary exists.
      // https://github.com/freebsd/freebsd-ports/blob/main/www/node22/Makefile
      // https://github.com/freebsd/freebsd-ports/blob/main/www/node24/Makefile
      if (!['x64', 'arm64', 'ia32', 'armv7', 'ppc64', 'ppc64le'].includes(arch)) return unknownArchitecture(host);
      if (olderThan(version, [13, 2])) return assessment('unverified', 'experimental', 'FreeBSD is below the upstream experimental 13.2 baseline; a compatible Node.js port needs separate verification.');
      return assessment('eligible', arch === 'x64' ? 'experimental' : 'community', 'FreeBSD has Node.js 22/24 ports; use the matching npm-node package and verify availability for this release and architecture.');
    case 'openbsd':
      // https://github.com/openbsd/ports/blob/master/lang/node/Makefile
      if (!['x64', 'arm64', 'ia32', 'ppc64', 'riscv64'].includes(arch)) return unknownArchitecture(host);
      return assessment('eligible', 'community', 'OpenBSD uses its community Node.js port; the selected OS release and architecture must provide Node.js 22 or newer.');
    case 'netbsd':
      // https://github.com/NetBSD/pkgsrc/tree/trunk/lang/nodejs22
      if (!['x64', 'arm64'].includes(arch)) return unknownArchitecture(host);
      return assessment('eligible', 'community', 'NetBSD has pkgsrc Node.js 22/24 ports; binary packages are named nodejs and depend on the repository release and architecture.');
    case 'termux':
      // https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh
      if (!['x64', 'arm64', 'ia32', 'arm', 'armv7'].includes(arch)) return unknownArchitecture(host);
      return assessment('eligible', 'community', 'Termux needs its Android Bionic Node.js package and Android 7 or newer; the Linux kernel release does not establish the Android API version.');
    case 'android':
      return assessment('unverified', 'unverified', 'Android outside Termux has no established RadioCLI runtime installation route; verify a compatible Bionic Node.js build.');
    case 'haiku':
      // https://github.com/haikuports/haikuports/tree/master/net-libs/nodejs
      return assessment('unverified', 'community', 'HaikuPorts currently provides Node.js 20; this newer runtime requires a separately verified custom Node.js port.');
    case 'sunos':
      return assessment('unverified', 'community', 'SmartOS x64 has upstream Tier 2 status; generic SunOS kernel 5.11 does not identify SmartOS, illumos distribution, or its version. Verify the selected Node.js port and playback backend.');
    case 'aix':
      if (arch !== 'ppc64') return unknownArchitecture(host);
      return assessment('eligible', 'tier-2', `AIX requires big-endian POWER8 or newer and AIX 7.2 TL04 or newer${major === 24 ? ', plus libstdc++12' : ''}; uname release alone does not establish these prerequisites. Playback backend availability needs separate verification.`);
    case 'unknown':
      return unknownArchitecture(host);
  }
}

function linuxRuntime(host: PlatformProfile, arch: string, major: number, version: number[]): RuntimeAssessment {
  if (host.isWsl) return assessment('unverified', 'community', 'WSL uses a Linux Node.js runtime, but upstream support requires reproducing issues on native Linux; verify this WSL environment separately.');
  if (arch === 'arm') return assessment('unverified', 'unverified', 'The generic arm architecture does not identify its ISA revision. Node.js 22 Tier 1 applies to ARMv7; older ARM and Node.js 24 ARMv7 need separate community verification.');
  if ((arch === 'ppc64' || arch === 'ppc64le') && host.endianness !== 'LE') {
    return assessment('unverified', 'unverified', 'Upstream Linux POWER support applies to ppc64le, not big-endian ppc64. A compatible big-endian Node.js 22+ community port must be verified separately.');
  }
  if (host.libc === 'musl') {
    // Node 24 now publishes x64-musl files while its matrix remains Experimental.
    // Other known routes are distributor builds, not glibc binary compatibility.
    // https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
    // https://github.com/nodejs/docker-node/blob/main/versions.json
    const knownRoute = ['x64', 'arm64', 's390x'].includes(arch) || (arch === 'armv7' && major === 22);
    if (!knownRoute) return assessment('unverified', 'community', `A Node.js ${major} musl build for ${host.arch} requires separate package and runtime verification.`);
    if (olderThan(version, [3, 10])) return assessment('unverified', 'experimental', 'This kernel is below the Node.js musl reference baseline; compatibility is unverified.');
    return assessment('eligible', arch === 'x64' ? 'experimental' : 'community', `Use a musl-specific Node.js ${major} build and its libstdc++ dependencies; libc family detection does not verify the musl version.`);
  }
  if (host.libc !== 'glibc') return assessment('unverified', 'unverified', `Linux libc is ${host.libc}; select a compatible Node.js build before declaring runtime eligibility.`);

  let upstream: UpstreamSupport;
  let minimumKernel = [4, 18];
  let minimumGlibc = '2.28';
  let detail = '';
  if (arch === 'x64' || arch === 'arm64') upstream = 'tier-1';
  else if (arch === 'armv7') {
    upstream = major === 22 ? 'tier-1' : 'experimental';
    detail = major === 22 ? ' ARMv7 binaries also require GLIBCXX_3.4.28.' : ' Node.js 24 ARMv7 needs a community build; no upstream release binary is provided.';
  } else if (arch === 'ppc64' || arch === 'ppc64le' || arch === 's390x') {
    upstream = 'tier-2';
    if (arch !== 's390x') detail = ' POWER8 or newer is required.';
  } else if (arch === 'riscv64' && major === 24) {
    upstream = 'experimental';
    minimumKernel = [5, 19];
    minimumGlibc = '2.36';
  } else if (arch === 'ia32') {
    upstream = 'experimental';
    minimumKernel = [3, 10];
    minimumGlibc = '2.17';
  } else return unknownArchitecture(host);

  if (version.length < 2 || olderThan(version, minimumKernel)) {
    return assessment('unverified', upstream, `The glibc Linux kernel does not establish the ${minimumKernel.join('.')} reference minimum; older kernels may work but require separate verification.`);
  }
  return assessment('eligible', upstream, `Node.js ${major} requires glibc >= ${minimumGlibc} and a compatible libstdc++; the profile records only the libc family.${detail}`);
}

function assessment(status: RuntimeStatus, upstream: UpstreamSupport, ...reasons: string[]): RuntimeAssessment {
  return {status, upstream, reasons};
}

function unknownArchitecture(host: PlatformProfile): RuntimeAssessment {
  return assessment('unverified', 'unverified', `No runtime eligibility is established for ${host.platform}/${host.arch}; verify a compatible Node.js port instead of inferring support from another target.`);
}

function architecture(arch: string): string {
  if (['amd64', 'x86_64'].includes(arch)) return 'x64';
  if (arch === 'aarch64') return 'arm64';
  if (['x86', 'i386', 'i686'].includes(arch)) return 'ia32';
  if (arch === 'armv7l') return 'armv7';
  return arch;
}

function releaseVersion(release: string): number[] | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[.+_-][\w.+-]+)?$/.exec(release);
  if (!match) return null;
  const parts = match.slice(1).filter(part => part !== undefined).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function olderThan(actual: number[], minimum: number[]): boolean {
  for (let index = 0; index < minimum.length; index++) {
    const difference = (actual[index] ?? 0) - minimum[index]!;
    if (difference !== 0) return difference < 0;
  }
  return false;
}
