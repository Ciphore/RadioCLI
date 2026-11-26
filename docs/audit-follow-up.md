RadioCLI 0.2.6 audit follow-up
============================

The two supplied audits were checked against the implementation. The changes preserve the existing feature scope and the requested behavior: resuming a radio station reconnects at the live edge. No manual nearby coordinates or foreground scheduler were added.

| Audit | Change |
| --- | --- |
| R01 | Ignore omitted patch fields, validate settings before persistence, preserve nested preferences across writers, and recover the specific malformed appearance sidecars produced by the original bug. |
| R02 | Register Homebrew executables through verified stable `opt` links. Scheduler diagnostics check the saved and loaded command and whether its Node/CLI files exist. Self-update reconciles registrations from the new installation. |
| R03 | Capture post-update repair before installation; run it in a fresh process using the updated installation, with validated results. |
| R04 | Serialize registration changes with runner claims. CLI, MCP, and TUI preserve active audio. Runner claim release and native cleanup share the same transaction, preventing concurrent resync from losing a newly registered job. |
| R05 | Give the brief alarm preview a normal completion duration separate from its watchdog. |
| R06 | Honor custom systemd config directories, link those units into the user manager, and preserve consistent empty/relative config paths in detached runners. |
| R07 | Start mpv explicitly unmuted and observe actual mute changes. |
| R08 | Reject malformed endpoint response envelopes before caching or selecting a mirror; ignore invalid cached envelopes and try another mirror. |
| R09 | Preserve listening beyond twelve hours when confirmed by persisted checkpoints; retain the ceiling for inferred legacy durations. |
| R10 | Checkpoint alarm listening every thirty seconds and identify history by occurrence so overlapping alarms and ordinary playback cannot finish or checkpoint each other's sessions. |
| R13 | Reject past one-time CLI additions and schedule edits before saving. |
| R14 | Keep malformed percent-encoded URL segments importable when a fallback station name is needed. |
| R15 | Resolve XSPF relative locations using the playlist URI and inherited `xml:base`, including namespace-prefixed playlists. |
| R16 | Expire automatic update-check timestamps that are materially in the future after a clock correction. |

R11 retains the requested live-edge resume behavior. R12's architecture-blind Windows package selection was not established as a functional failure on the supported Windows systems; no new installer/backend support was introduced. Native Windows ARM setup remains outside the checks performed here.

Existing registrations written by an older release may need `radiocli alarm sync` from the updated installation. The updated self-update flow performs this automatically for inactive alarms. An already playing older runner can still overwrite its future registration when it exits, so repair explicitly reports deferral instead of interrupting audio or claiming success. Dismiss that alarm, then run `radiocli alarm sync`. Restart RadioCLI and MCP clients after installing an update.

Verification on macOS:

- Full `npm run verify`: type checks, unused/whitespace/export checks, 3,260 passing tests, build, and provider data smoke. Nineteen tests were skipped by their platform/environment guards.
- Node 22.22.3: 584 focused regression tests passed, with six platform skips; the follow-up repair suite was also exercised.
- Node 24.15.0 and Node 22: real MCP stdio smoke, including partial appearance/preferences and persisted favorites; CLI smoke with background mpv, null audio, shared-session controls, presets, completion, and clean stop.
- Package validation with `publint`, plus `git diff --check`.
- Independent Astra High review. Its four findings—cleanup serialization, explicit active-upgrade deferral, XDG normalization, and transient Windows lock retries—were addressed. The reviewer found no further substantive defects in the revised diff.

Native systemd and Windows Task Scheduler execution, hardware audio output, and the full OS/CPU CI matrix were not run on this Mac. Cross-platform registration formats and lifecycle paths were checked with isolated fixtures; the repository's existing CI matrix remains the native validation step.
