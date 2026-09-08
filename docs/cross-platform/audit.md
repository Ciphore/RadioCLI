# Cross-platform design and baseline audit

The initiative starts at `6d8cc2dc7ef8a02e2bf8a2406800e6f6cbce3ab9`
(`Release 0.2.3`). All implementation belongs to
`codex/comprehensive-cross-platform-support` and one draft pull request into
`Ciphore/RadioCLI:master`. Release publication and merging are owner actions.

## Design

Host identity, runtime availability, integration implementation, and observed
readiness are separate facts. A platform profile identifies the kernel, runtime,
architecture, libc where detectable, and environments such as Termux and WSL.
A central adapter policy selects native integrations. Capability results explain
both availability and its prerequisites; selecting an adapter is not proof that
its service, desktop, audio device, or executable works.

The existing playback, scheduler, terminal, and storage modules remain the owners
of their operations. They consume the platform layer rather than adding new OS
branches in UI or command handlers. Commands use executable/argument arrays;
shell boundaries are explicit and tested. Optional operations must report actual
failure and leave unrelated playback, browsing, and local-library operations
usable.

Pure detection with injected host facts was chosen over a new inheritance
hierarchy: it fits the existing injectable adapters and makes capability
decisions testable without pretending a mocked host is a native installation.
Native verification remains a separate requirement.

Existing store filenames, migration precedence, alarm occurrence semantics,
private control authentication, and normal Unicode/truecolor rendering are the
compatibility baseline. Environment-selected accessibility and constrained
terminal modes must not rewrite saved user preferences.

## Baseline inspection

Repository configuration, README, security/contribution guidance, architecture,
design, reliability, installation, alarm, packaging, roadmap, and CI documents
were inspected before implementation. No repository-specific `AGENTS.md` or shared
repository memory was present. The initial local-only editor configuration was
removed as requested for a clean checkout.

The initial local test counts also included 216 duplicate tests from an ignored
legacy security-audit scratch copy. It was discovered during comparison with
the isolated staged tree and removed under the clean-checkout request.
The actual original repository contains 690 tests; the committed baseline tree
passes all 1,268 tests (690 original plus 578 captures) on Node 22.23.2.

The original CI runs Node 22 and 24 on Ubuntu, macOS, and Windows. Live data,
playback, and fresh packed-install checks are skipped on pull requests. Therefore
an ordinary successful PR check does not establish packed-install or playback
coverage. All existing action references are immutable commits.

On native macOS 26.5.2 arm64 with Node 26.8.1/npm 11.19.0:

| Baseline check | Result |
| --- | --- |
| `npm ci`; `npm --prefix apps/docs ci` | Passed; runtime tree reports two low-severity advisories, docs tree none |
| `npm run check` | Passed |
| `npm run lint` | Initial whitespace failure came from untracked editor files; clean-tree rerun passed |
| `npm run test` | 890 passed, 16 failed in the alarm TUI integration file under concurrent build load |
| Isolated alarm TUI test rerun | All 34 passed; timing and external side effects require harness hardening |
| `npm run build` | Passed |
| `npm run smoke:data` | Passed against live Radio Browser, including station URL resolution |
| `npm run smoke:mcp` | Passed; 31 tools through built stdio server |
| `npm run pack:check`; `npm run check:package` | Passed |
| `npm run fresh:check` | Passed against an installed npm tarball and live provider check |
| `npm run docs:check`; `npm run docs:build` | Passed |

Node 26 is supplementary evidence. Node 22/24 runs, native playback checks,
deterministic visual captures, and the final package matrix are recorded in the
[verification report](verification.md). An interrupted playback attempt during
dependency replacement is not playback evidence.

A second baseline on Node 22.23.2 reproduced the alarm-test race (888 passed,
18 failed). The replacement test harness keeps the existing 34 tests,
uses React `act` with controlled timers, and isolates provider discovery,
update checks, and local-session registration. Batched keyboard input and the
20 ms lone-Escape distinction remain exercised.

The baseline adds 578 deterministic Ink captures before rendering changes:
every screen and settings group at 100×30, 50×16, and 24×8, Unicode/ASCII and
color/no-color variants, all receiver styles at full size, representative small
receivers, and focused ANSI palette/selection captures. Time, timezone, station
data, and animation frame are fixed; harmless trailing padding is omitted.
These are terminal-renderer captures on macOS, not evidence of another OS's
font, terminal, or desktop integration. Native ffplay also passed the playback
smoke test with a generated local silence WAV; no AirPlay receiver was verified.

## Platform-sensitive operation inventory

| Operation | Existing implementation and audit focus |
| --- | --- |
| Executable discovery | `player/command.ts`, `agent/launcher.ts`, `alarms/{scheduler,inhibitor,terminal-launcher}.ts`: consolidate executable permission checks, Windows suffixes/registry paths, Unix prefix directories, and explicit player overrides |
| Installation | `setup.ts`, `player/backend-install.ts`: keep confirmation/dry-run, share distro/package facts, distinguish FreeBSD `pkg` from Termux `pkg`, verify package names and privilege requirements |
| Paths and persistence | `storage/store.ts`, `providers/cache.ts`, alarm runtime/health/presence/Guard stores, `agent/session.ts`: preserve current and legacy paths; test non-ASCII/spaces, private modes, atomic replacement, corruption and read-only failures |
| Shell boundaries | `setup.ts`, `update-check.ts`, scheduler/terminal and MCP adapters, `scripts/fresh-check.mjs`: argument arrays by default; verify POSIX, Windows, XML, and systemd escaping independently |
| Playback and IPC | `player/player-controller.ts`, `mpv-ipc-client.ts`: preserve readiness, pause/mute/volume/metadata and cleanup; test actual Unix sockets and Windows named pipes; bound socket path length |
| Browser and clipboard | `ui/system-actions.ts`: unknown Unix currently assumes desktop tools; asynchronous spawn failures can be reported as success; use actual completion/failure and session-aware candidates |
| Terminal reopening | `alarms/terminal-launcher.ts`, `agent/launcher.ts`: preserve saved descriptors; check executable/session availability, Unix desktop terminals and explicit headless limitations |
| Scheduling and alarm controls | `alarms/{scheduler,runner,active-session,setup-verification,guard}.ts`: preserve occurrence locks, DST, missed-run grace, retry/fallback/snooze, authentication and runner-safe cleanup; verify native removal instead of swallowing failures |
| Sleep, wake, system volume | `alarms/{inhibitor,system-volume}.ts`: retain macOS/Windows integrations; Linux tools require the actual service; no invented wake or per-process Termux wake-lock guarantees |
| Network, DNS, proxies, TLS | provider adapters, update checker, authenticated local HTTP clients: retain hostname resolution and TLS checks; separate public requests from direct loopback control; prove proxy behavior on the selected Node version |
| Offline and bandwidth | provider cache/manager, UI startup, update checker: local state and cached data remain usable; an explicit offline policy prevents directory/update requests without pretending remote audio is offline |
| Terminal capabilities | `ui/display-context.ts`, ASCII conversion, receiver animation, CLI/setup rendering: preserve rich defaults; honor NO_COLOR, limited color, locale, screen reader, dumb/headless and small-terminal behavior |
| AirPlay | discovery, player/worker, agent service and settings: keep macOS-only, explicit output selection, optional dependency safety gates and current-session semantics |
| MCP | install/launcher/session/server: preserve opt-in settings and upgrade-stable registrations; no unsupported terminal launch reported as success; local tokens must never reach an HTTP proxy |
| Packaging and architecture | package manifests/locks, fresh install/build scripts, Homebrew template and CI: package-lock native entries are not runtime proof; retain strict checking and audit gates |

## Commit sequence and verification gates

1. **Baseline audit and test coverage:** make UI tests deterministic, capture
   unchanged full/compact/micro frames, and record baseline command evidence.
2. **Platform capability architecture:** introduce tested profile, adapter,
   path, and capability contracts; move existing decisions without changing
   existing-platform behavior or persisted schema.
3. **Existing-platform regression hardening:** add regression tests before fixes
   for false success, executable/permission and IPC boundaries, native scheduler
   cleanup, private proxy bypass, and constrained storage.
4. **BSD and non-systemd Linux:** add verified package plans and Unix desktop
   capability paths. Expose unavailable reliable background scheduling explicitly.
5. **Portable terminals and accessibility:** integrate locale/ASCII/color,
   screen-reader and degraded-rendering policy; compare normal rendering with
   the captured baseline and retain keyboard/focus coverage.
6. **Additional Unix and Termux targets:** implement only verifiable command and
   path adapters, diagnose runtime/optional integration limitations, and keep
   unverified native paths experimental.
7. **Architecture coverage:** model runtime-specific architecture limits and test
   unsupported combinations without equating compilation with runtime support.
8. **CI and packaging:** preserve the original matrix; add deterministic packed
   smoke/playback checks, genuine native/VM extended jobs where available, and
   immutable action pins. Document the execution method for each job.
9. **Documentation and compatibility audit:** reconcile platform tiers with
   evidence, run the complete suite, fetch/integrate upstream safely, review the
   merge-base diff and dependencies, and finish the single draft PR with risks,
   visual evidence, remaining experimental work, and rollback instructions.

Every commit must typecheck, build, and pass relevant tests. The complete final
suite includes lint, tests, builds, documentation, package audit/lint, packed
installation, data, playback, and MCP smoke checks. No test or security gate is
removed to make a platform pass.

## Evidence and scope rules

- **First-class:** required native CI, an installation path, prerequisites, and
  release-blocking package/startup tests for the documented combination.
- **Supported:** repeatable functional verification on the actual platform,
  with its limits documented.
- **Experimental/community:** implemented paths with incomplete native evidence
  or an incomplete upstream runtime/dependency story.
- **Unsupported:** blocked runtime or unavailable capability is diagnosed
  explicitly. This can apply to one integration without disabling the app.

BSD `at` polling and generic cron/service supervision do not automatically meet
the current timing, session, and catch-up contract. Android JobScheduler and
Doze also cannot be presented as equivalent native alarm delivery. Native
scheduler support remains a separate capability from general CLI/TUI support.
Haiku, illumos/SmartOS, AIX, musl, and uncommon architectures require exact runtime
and playback evidence before any promotion in tier. Windows XP and separate
legacy applications are outside the initiative.

## Implementation and compatibility review

The final platform layer lives in `src/platform/`. Runtime identity and upstream
runtime eligibility are separate from verified project support. Capability
results keep playback, storage, desktop integration, terminal reopening,
scheduling, power, volume, rendering, and AirPlay independent. Doctor reports
the current installation's evidence scope; it does not claim acceptance tests
were run merely because a reference CI machine passed.

The operation owners remain in `player`, `providers`, `storage`, `alarms`,
`agent`, and `ui`. Existing launchd, Task Scheduler, and systemd adapters remain
in place. They now preserve cleanup evidence on actual failure, check a usable
systemd user manager, retain unverified live Guard ownership records, and avoid
consuming an alarm occurrence when a scheduler invokes it early. Terminal launch
requests preserve literal arguments, necessary player/session environment, and
the existing saved descriptors. Windows uses an encoded Node bootstrap across
PowerShell's native-argument boundary; console creation is tested separately
from a successful process request.

Storage changes preserve the schema, current/legacy path precedence, library
filenames, and settings defaults. Writes stage the next in-memory state and
publish it only after atomic persistence succeeds. Failed writes keep the old
file and in-memory state; an error in optional history, cache, presence, or
listening statistics is reported without stopping unrelated playback. No data
migration is needed. Explicit ASCII, screen-reader, offline, and reduced-motion
environment overrides do not rewrite saved preferences.

FreeBSD, OpenBSD, NetBSD, and Termux have explicit package and executable plans.
BSD desktop helpers require the actual display and tool. Other Unix package
routes retain their runtime or native-player limits. Non-systemd Linux and the
new OS targets report background scheduling as unavailable; no cron, `at`, or
Android substitute weakens the existing delivery contract.

All 578 renderer captures remain covered. Compared with the first committed
baseline, all 335 Unicode/ANSI captures are unchanged. Of 243 ASCII captures,
160 intentionally replace remaining decorative Unicode (including bars, bullets,
and ellipses), while 83 are unchanged. User-supplied station names and metadata
are preserved. See [before-and-after terminal captures](visual-before-after.txt)
and the [complete snapshot fixture](../../src/ui/__snapshots__/visual-baseline.test.tsx.snap).
These are renderer captures, not photographs of native terminal applications.
Keyboard, focus, provider caching, imports/exports, storage recovery, player
controls, and alarm lifecycle tests remain in the suite.

## Dependency and security audit

- `package.json`, the root lockfile, and the documentation lockfile retain the
  original dependency versions. No runtime dependency, lifecycle package
  installation, registry publication, or external packaging change was added.
- Required-runtime and documentation dependency audit gates remain enabled,
  together with strict TypeScript, unused/export/whitespace checks, and package
  lint. Normal local installs still report the existing two low-severity
  optional-tree advisories; required-runtime and docs audit gates pass.
- Authenticated local control uses a direct HTTP agent and IPv4/IPv6 loopback
  binding. Regression tests exercise actual local proxy listeners and confirm
  private control tokens are not sent through environment proxies. Ownership
  tokens are not inserted into terminal command lines or diagnostic output.
- Public provider/update requests retain TLS verification and bounded deadlines
  through response-body consumption. Native HTTP(S) proxy opt-in is diagnosed;
  unsupported SOCKS/ALL_PROXY configurations fail explicitly. External player
  networking remains separate. Offline mode suppresses public directory and
  update requests, and low-bandwidth mode reduces background discovery.
- Every CI action is pinned to a full immutable commit. New vmactions guest
  providers run with read-only repository permissions and no repository secrets.
  Their maintained VM image downloads remain an external supply dependency,
  distinct from the pinned action source. Native macOS/Windows mpv fixtures use
  fixed official release assets, pinned SHA-256 values, and CPU-header checks.
  Linux/BSD package catalogs remain the selected distribution's trust boundary.
  NetBSD's minimal guest additionally installs its matching official X11 base
  set with a pinned SHA-512 digest, because the native mpv package links to those
  OS libraries even with null output.

The final review covers the complete diff from the original merge base as well
as the native-CI corrections. Review findings are accepted only after checking
the affected contract and reproducing the problem. In particular, an upstream
community runtime route does not imply upstream Tier 1 support, and a screen
reader label is evaluated against Ink's actual accessible output behavior.

## Risks, limits, and rollback

The broadest risk is interaction with real desktop/session policy: terminal
permissions, task registration, audio devices, wake policy, and screen-reader
applications need checks beyond deterministic rendering and null-audio IPC.
Native tests do not establish every Windows desktop edition, older macOS release,
WSL distribution, or Linux init/audio combination. The exact verification
matrix and remaining experimental targets are recorded in the
[platform guide](../../apps/docs/content/docs/platforms.mdx).

The package still requires Node 22 or newer. Standard HaikuPorts Node 20 remains
blocked; AIX playback, Termux devices, illumos, musl, and additional CPU targets
retain their stated verification gaps. AirPlay stays an optional experimental
macOS feature; loading its sender and finding Bonjour/FFmpeg do not establish a
receiver connection. Unsupported optional capabilities cannot be promoted by
mocked host tests or a successful build.

Rollback can revert this initiative's commits on an owner-managed branch or
restore the previously installed RadioCLI package. There is no schema downgrade
or lockfile migration to reverse. Back up the library before changing versions.
If this version registered alarm tasks, use its normal alarm removal/repair
commands while its CLI remains installed, confirm native cleanup, and then
re-register with the selected older version. Preserve failed-cleanup health and
ownership records for diagnosis; do not delete live control state or kill a PID
based only on an unverified record. Terminal and rendering environment overrides
can be removed independently. The repository owner retains all merge and release
decisions.

## Reviewer checklist

- Check each reference platform tier against the recorded native or full-guest
  result, Node version, install mode, and artifact hash.
- Confirm rich rendering against the baseline and inspect intentional ASCII
  changes, screen-reader output, and small-terminal keyboard behavior.
- Review quoting and environment propagation at POSIX, systemd, Windows XML,
  PowerShell, and terminal boundaries.
- Exercise optional-feature failures and alarm cleanup on a representative real
  desktop before expanding its advertised feature coverage.
- Check direct authenticated loopback control, proxy diagnostics, private file
  permissions, failed-write preservation, and unchanged data compatibility.
- Keep required CI and package/playback gates in the release process; retain
  explicit limits for the extended platforms.
