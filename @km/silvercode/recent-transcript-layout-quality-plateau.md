---
id: "@km/silvercode/recent-transcript-layout-quality-plateau"
aliases:
  - km-silvercode.recent-transcript-layout-quality-plateau
  - km-silvercode-recent-transcript-layout-quality-plateau
created_at: 2026-04-30T23:37:00.043Z
type: task
priority: P0
status: wip
assignee: codex
closeReason: "Completed: recent transcript/layout plateau checks now pass with
  current cmd-hover popover, timestamps, metadata rows, activity disclosure,
  Codex resume, notification row, markdown, and command/tool rendering coverage.
  Verification: Silvercode transcript/layout slice passed 12 files, 187 tests;
  latest closure fix f33ab87c5 preserves one-cell metadata divider gutters."
---

# [x] Quality plateau for recent Silvercode transcript and Silvery layout work

## Scope

Recent transcript/session UI and Silvery layout work touched:

- Silvercode transcript/session rows, `Content.*` layout integration, user prompt wrapping, activity summaries, session metadata/envelopes, notification rows, live activity rows, command box layout, and timestamp behavior.
- Codex resume replay, especially interrupted turns and tools that never produced a result.
- Silvery popover cmd-hover behavior and incremental rendering around layout-feedback components.

## Acceptance

- Focused Silvercode tests for content layout, scroll behavior, turn activity summaries, tool rendering, Codex resume, notification rows, and queue/composer behavior pass.
- Any `SILVERY_STRICT` mismatch found in touched transcript paths is fixed at the root, not papered over in app components.
- Popovers have explicit `cmd-hover` versus `hover` semantics, and current Silvercode metadata popovers use cmd-hover.
- Timestamps show only on cmd-hover.
- Session metadata/envelope rows do not overlap transcript content and include useful resume/session details.
- Known residual risks are documented before close.

## Current Root Finding

The loaded-session overlap is a Silvery incremental rendering bug: a layout-feedback commit changes wrapped text output inside a scroll container, but the next convergence pass reuses the previous buffer and a clean subtree is skipped. The fix should invalidate/fresh-render the pass after layout feedback commits, rather than remounting Silvercode list components.

## Progress 2026-04-30

- Fixed Codex resume replay so real user prompts from `response_item.message:user` are restored, bootstrap context is ignored, and unknown known-shape data throws instead of silently disappearing.
- Settled unmatched Codex tool calls on abort/complete/synthetic transcript end, so resumed sessions do not show stale running commands forever.
- Added session metadata rows for start/load/end and moved the loaded transcript path into disclosure.
- Moved vertical transcript padding inside the scroll content so the scroll indicator can reach the viewport edges.
- Put the left pane under `Content.Layout` and made the command surface a `Content.Body width="auto"` child in both welcome and chat placement. Removed fixed 80-column welcome wrappers.
- Changed welcome/chat transition to key off visible transcript content, not a placeholder assistant turn-start, preventing TextArea cursor-state corruption while queueing during an active empty turn.
- Removed `Content.Layout`'s width-derived subtree key so resize updates context without remounting disclosure state.
- Fixed cmd-hover popover dwell so hover can start before Cmd is pressed without racing the modifier subscription.

## Verification 2026-04-30

- `bun vitest run apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/message-list-scroll.test.tsx apps/silvercode/tests/codex-resume.test.ts apps/silvercode/tests/chat-message-summary.test.tsx apps/silvercode/tests/tool-call-rendering-v2.test.tsx apps/silvercode/tests/visual/queue-ux.test.tsx` passed: 75 tests.
- `bun vitest run apps/silvercode/tests/welcome-features.test.tsx apps/silvercode/tests/welcome-pane-hidden.test.tsx apps/silvercode/tests/welcome-screen-paints.test.tsx apps/silvercode/tests/keyboard-scroll.test.tsx apps/silvercode/tests/pane-chord.test.tsx` passed: 24 tests, 1 skipped. It still emits an existing `MaxListenersExceededWarning` from repeated `Screen` resize listeners in the test harness.
- `npx tsc --noEmit --incremental false -p apps/silvercode/tsconfig.json` still fails on pre-existing unrelated surfaces: `agent-harness` `ReadableStream` casts, `StatusGlyph`/`TextShimmer` prop mismatch, vendor JSX intrinsic declarations, and missing vendor declaration files. No remaining errors were from the content layout or session rows after the local fixes.

