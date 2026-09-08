# Adversarial review remediation

**Goal:** Resolve original review findings 1–9 on `codex/comprehensive-cross-platform-support`, based on reviewed commit `7762f93`.

**Architecture:** Keep platform policy separate from native mechanics. Preserve launch identity through one explicit environment contract; use structured native absence/failure results; make deletion one awaited operation that persists the disabled state before native cleanup. Share the original output-volume baseline across runners, serialize mutations, and journal native write helpers through actual process exit. Consolidate package recipes and remove obsolete code.

**Execution:** Use the subagent-driven-development and dispatching-parallel-agents workflows for independent platform tasks, with local integration and adversarial review. Work in the existing feature checkout. Changes remain reviewable without automatic commits or publication.

## Original findings and acceptance criteria

- [x] **1 — High / Bug:** `use-alarm-tui.ts` abandons a deletion promise whose recovery write can throw. Cover native failure plus storage failure and native success plus storage failure. Keep playback and navigation available, report native/persistence failures accurately, retain repairable definitions, and avoid unhandled rejections.
- [x] **2 — Medium / Bug:** `launchEnvironment` omits legacy/XDG storage selectors. Parent and child must select identical library, cache, and runtime paths with clean child environments, preserving supported historical namespaces. Do not persist arbitrary shell environment or secrets.
- [x] **3 — Medium / Bug:** Windows task removal recognizes absence only through English text. Remove/query only the named RadioCLI job, distinguish structured absence from access denial or unknown failure, and retain repair artifacts on unverified removal.
- [x] **4 — Medium / Bug:** `x-terminal-emulator` can invoke QTerminal while bypassing its command-string quoting fix. Preserve exact argv through supported aliases, including spaced executable paths, apostrophes, shell metacharacters, flags, and multiple arguments.
- [x] **5 — Medium / Architecture:** Independent system-volume leases restore conflicting snapshots. Share one baseline across runner processes, serialize mutations, and restore only after the final participant releases. Track orphan native helpers through exit before recovering a dead runner. Cover failure, retry, and overlap without touching real audio devices.
- [x] **6 — Low / Bug:** Desktop helper timeout resolves after SIGTERM without ensuring termination. Add bounded escalation and lifecycle cleanup; test a real owned process that ignores SIGTERM.
- [x] **7 — Low / Redundancy:** Setup recipes and textual hints have parallel platform/package branches. Generate ordinary hints from the selected package recipe; retain explicit manual prerequisites. Consolidate duplicate OS-release reading.
- [x] **8 — Low / Dead Code:** Remove `noColorRequested`, `openExternalCommand`, and `clipboardCommands` production exports used only by tests. Keep behavioral coverage on actual entry points. Migrate internal consumers and remove redundant compatibility forwarding modules.
- [x] **9 — Low / Redundancy:** Both Linux matrices run identical packed installs. Retain one packed-install matrix and the distinct playback smoke.

## Implementation sequence

1. Add behavioral regression tests for deletion; run them against the unfixed implementation; implement awaited recovery and rerun focused UI/service tests.
2. Independently implement launch identity/alias forwarding, structured Windows task cleanup, and package/CI consolidation, each with failing-first regression coverage.
3. Implement shared system-volume ownership with short serialized transactions, testing separate controllers/processes, failed acquisition, failed restoration, release retry, handoff contention, and orphan native helpers.
4. Strengthen desktop helper cleanup with actual process-exit verification; remove obsolete exports and migrate compatibility imports.
5. Review each independent change for requirements and code quality; resolve integration failures without weakening assertions.

## Validation and final review

- [x] Run focused tests while developing and record the original failure and corrected behavior.
- [x] Run full Vitest suite and Node package-smoke harness tests.
- [x] Run `npm run check`, `npm run lint`, `npm run build`, `npm run check:package`, and repository-standard smoke/package checks that apply.
- [x] Run docs checks/build if documentation or generated usage contracts change.
- [x] Search for deleted symbols/imports and inspect `git diff --check` and the complete diff.
- [x] Re-run review reproductions for all nine findings.
- [x] Perform fresh adversarial review of recovery, native resource scope, clean launch environments, volume ownership, and real helper teardown; fix any new defects.
- [x] Report concrete fixes, deletions, regression coverage, actual validation results, remaining limitations, and merge verdict.

## Final review corrections

- Canonicalize relative and empty path selectors against the invoking directory.
- Preserve long-lived browser openers while fully stopping owned clipboard helpers and launch bootstraps.
- Commit volume participants only after native adjustment and persistence succeed.
- Await handoff ownership changes before runner cleanup and allow the client to wait through lock contention.
- Journal native writes before spawn; retain uncertain state and wait for surviving helpers before crash recovery.
- Migrate the packed playback harness's dynamically constructed import after deleting the executable forwarding module.

## Validation results

Final native macOS ARM64 runs on Node 22.23.2 and 24.20.0 each passed all 1,983 tests across 95 files, with 9 native-platform skips. Both runtime lines passed normal and omit-optional fresh package installation, CLI/doctor/offline cache/import/export, 31 MCP tools, and real mpv readiness/volume/pause/resume/stop using null audio output.

The following checks also passed: `npm run check`, `npm run lint`, `npm run build`, `npm run check:package`, `npm run pack:check`, `npm run smoke:data`, `npm run smoke:mcp`, `npm run smoke:playback`, `npm run docs:check`, `npm run docs:build`, `npm run audit:runtime`, `npm run audit:docs`, `actionlint .github/workflows/ci.yml`, and `git diff --check`. The two Node package-harness files passed all 12 tests. A built CLI setup dry run in isolated storage printed the expected Homebrew plan without installing packages.

Live Windows/BSD/Linux scheduler and desktop integration, native OS mixer behavior, and audible hardware playback remain unverified on this macOS host. Forced-exit recovery waits for any surviving recorded mixer helper; an unknown helper journal requires the documented restart/repair procedure. PID reuse is handled conservatively. Manual root review and fresh independent review found no further concrete defects after the corrections above.
