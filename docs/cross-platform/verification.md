# Cross-platform verification record

This record accompanies the [single draft cross-platform PR](https://github.com/Ciphore/RadioCLI/pull/36).
The original merge
base is `6d8cc2dc7ef8a02e2bf8a2406800e6f6cbce3ab9`; baseline details, security
review, compatibility, risks, and rollback are in [the audit](audit.md).
The [platform guide](../../apps/docs/content/docs/platforms.mdx) contains runtime
minimums, installation routes, native capability limits, and evidence-based tiers.

## Local acceptance

Local execution used native Apple Silicon on macOS 26.5.2, Darwin 25.5.0, with
separately installed Node 22.23.2/npm 10.9.8 and Node 24.20.0/npm 11.19.0.
Each runtime's clean dependency installation finished before tests using that
dependency tree. Node 26.8.1 was supplementary regression evidence, outside the
maintained Node 22/24 matrix.

The following commands passed on both maintained runtime lines:

```sh
npm ci
npm run check
npm run lint
npm run test
npm run build
node --test scripts/packed-smoke.test-node.mjs scripts/install-smoke-mpv.test-node.mjs
npm run audit:runtime
npm run smoke:data
npm run smoke:mcp
npm run smoke:playback
npm run pack:check
npm run fresh:check -- --require-mpv
npm run check:package
npm --prefix apps/docs ci
npm run docs:check
npm run docs:build
npm run audit:docs
```

At the `fd57fda` runtime-code checkpoint, each full local suite passed 1,841
tests, with three Windows-only native checks skipped on macOS. The standalone
package-harness suite passed 12 tests. Required-runtime and documentation audit
gates reported no vulnerabilities; the normal dependency tree retained the
original two low-severity optional-tree advisories.

Live data smoke used Radio Browser and resolved a real station URL. MCP smoke
started the built stdio server and checked 31 tools. Local playback smoke used
a generated silence WAV and a real native mpv executable. The separately verified
mpv 0.41.0 release fixture was checked against its pinned SHA-256 and Mach-O CPU
header. Playback uses null audio for repeatability and is not evidence of sound
from speakers or of a working AirPlay receiver.

The packed harness installs one actual npm tarball into two fresh temporary
projects, with normal dependencies and with `--omit=optional`. It exercises the
installed executable and npm bin wrapper, CLI/doctor, stale offline cache hits
and misses, direct URLs, Unicode/space-containing playlist paths, import/export,
MCP status, and real mpv readiness/volume/pause/resume/stop over native IPC.
A fetch guard fails the fixture if an offline CLI check attempts live network
access. Temporary paths also contain literal `#` and `%`; preloads use file URLs
so URL delimiters and Windows drive letters retain their path meaning. Each
successful record contains the exact artifact SHA-256 and runtime.

## Native and guest execution

The expanded workflow preserves the original six Ubuntu/macOS/Windows Node
22/24 combinations and adds Linux arm64, macOS Intel, and Windows 11 arm64 on
both Node lines. Each required job now installs and exercises the packed artifact
in both dependency modes with real native mpv. Four Linux jobs also run the
source playback smoke; two jobs check/build/audit the documentation.

All 22 jobs passed in [run 34180703652](https://github.com/MrSeizy/RadioCLI/actions/runs/34180703652)
at code checkpoint `fd57fda75dfed9de547293b9fb28f5fc30f5f0fa`: 12 required native
verification jobs, four Linux playback jobs, two documentation jobs, the guest
artifact build, and three BSD guest jobs. Every native verification job passed
both packed installation modes and real mpv IPC playback. Windows also passed
real PowerShell literal-argument, environment, and independent-console tests;
the console child had actual interactive stdin, stdout, and stderr handles.

| Reference environment | Kernel | CPU | Node / npm pairs |
| --- | --- | --- | --- |
| macOS 26.6.2 | Darwin 25.6.0 | arm64 | 22.23.2 / 10.9.8; 24.20.0 / 11.19.0 |
| macOS 15.7.9 | Darwin 24.6.0 | x64 | 22.23.2 / 10.9.8; 24.19.0 / 11.17.0 |
| Ubuntu 24.04.4 LTS, glibc | 6.17.0-1022-azure | x64 and arm64, each tested | 22.23.2 / 10.9.8; 24.20.0 / 11.19.0 |
| Windows Server 2025 Datacenter | 10.0.26100 | x64 | 22.23.2 / 10.9.8; 24.19.0 / 11.17.0 |
| Windows 11 Enterprise | 10.0.26200 | arm64 | 22.23.2 / 10.9.8; 24.20.0 / 11.19.0 |
| FreeBSD full guest | 14.4-RELEASE | x64 | 22.23.2 / 11.19.1 |
| OpenBSD full guest | 7.9 | x64 | 22.23.2 / 10.9.8 |
| NetBSD full guest | 10.1 | x64 | 22.23.0 / 10.9.8 |

Each macOS/Linux suite passed 1,841 tests and skipped three Windows-only native
probes. Windows Node 22 passed 1,828 with 16 platform-specific skips; Windows
Node 24 passed 1,826 with 18 skips, including two optional AirPlay source checks
whose dependency files were absent. POSIX permission and helper fixtures are
not represented as native Windows checks. All Windows PowerShell/console probes
and shared capability tests ran. No existing assertion, capacity limit, or test
deadline was relaxed to obtain these results.

The repeatable BSD checks install the Linux-built JavaScript tarball inside
full FreeBSD, OpenBSD, and NetBSD guest kernels. Node and mpv come from each
guest's native package repository. The x86_64 guests use QEMU on same-CPU Linux
hosts; they are full guest runtime verification, not Linux containers or
foreign-CPU verification. The BSD route explicitly uses `--omit=optional` and
does not establish the optional native AirPlay sender, a GUI terminal, physical
audio, or a background scheduler.

CI evidence is retained as artifacts for native jobs and structured
`packed_smoke` records in guest logs. A build result alone is never substituted
for guest execution. These are the exact tested tarball SHA-256 values at the
recorded code checkpoint; normal and omitted-optional installations on each
native target used the same target tarball:

| Tarball build and execution | SHA-256 |
| --- | --- |
| macOS/Linux builds; Linux-built artifact also executed in all three BSD guests | `70342ce5a1b4c9b06a34d9b90c915ff585422392e10a7f683a01f8269ff3c4ef` |
| Windows builds, executed on x64 and arm64 | `018fa6656d868c2e27007d7e688814a8768526c154e7cfcb9928a53315ba6463` |

The final documentation commit changes the tarball contents. Its fresh-install
hashes and complete CI results are recorded in the linked PR, keeping this
committed report tied to the independently identifiable code checkpoint.

## Visual and interaction evidence

- The 578 deterministic Ink snapshots cover major screens, settings, receivers,
  and full/compact/micro layouts at 100×30, 50×16, and 24×8.
- All 335 Unicode/ANSI snapshots match the first committed baseline. Of 243 ASCII
  snapshots, 160 intentionally replace decorative Unicode and 83 remain the same.
- [Before-and-after terminal captures](visual-before-after.txt) show representative
  full, compact, and micro changes. The complete snapshots remain under test in
  `src/ui/__snapshots__/visual-baseline.test.tsx.snap`.
- Additional integration tests cover ASCII/color/locale/dumb-terminal policy,
  screen-reader semantics, keyboard/focus behavior, offline startup, read-only
  storage, and playback-gated or disabled animations.
- A real local PTY invocation with stdout redirected to a file produced no ANSI
  escape sequences and exited through the normal keyboard quit path. This
  separately checks the actual CLI entrypoint's stream detection.

The renderer and mocked-host fixtures validate their specific code contracts.
They do not claim another OS's terminal fonts, a physical display, a screen-reader
application, audible output, or actual sleep/wake delivery.

Rendering fixtures retain their original assertions, dimensions, and five-second
deadlines. A paired comparison of the two existing screen-rendering suites kept
all 144 frames identical while closing every mounted Ink view and removing host
terminal-size subprocesses. The alarm journeys' per-test footer-layout cache
delegates each distinct input to the real function; all 124 paired journey frames
remained identical. Polling tests assert that the active clock actually polls.
The 500-alarm capacity test retains its original limit and deadline; timezone
canonicalization now performs one native validation per value instead of two.
