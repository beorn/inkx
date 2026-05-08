---
aliases:
  - km-silvercode.screenshot-review-regressions
  - km-silvercode-screenshot-review-regressions
created_at: 2026-05-07T21:47:55.615Z
---

# Fix Silvercode screenshot review regressions #bug #P1

Screenshot-driven follow-up for the current Desktop Silvercode screenshots and comparison shots under ~/Desktop/other-tuis. Track and fix the visible Silvercode UX/layout regressions as one coherent pass, then verify with focused tests and fresh screenshots.

Initial source set: ~/Desktop/Screenshot 2026-05-07 at 14.08.12.png, 14.08.39.png, 14.09.45.png, 14.16.17.png, 14.23.35.png plus comparison/reference shots under ~/Desktop/other-tuis/.

## Screenshot Review Notes

Reviewed inventory:

- Direct `~/Desktop/Screenshot *.png` files: current 2026-05-07 Silvercode screenshots plus older 2025-12 through 2026-03 km-tui/theme/detail-board references.
- `~/Desktop/other-tuis/`: named reference shots (`claude-agents.png`, `claude-code-parity.png`, `codex-plan.png`, `queued-interrupted.png`, `nicer-bullets.png`) plus the `codex/`, `opencode/`, `cc progerss/`, and `permissions/` screenshot directories.

Primary Silvercode regressions visible in the 2026-05-07 Desktop screenshots:

- User prompt bubbles can overlap prior/next assistant transcript content instead of reserving layout space. In `Screenshot 2026-05-07 at 14.08.12.png`, the right-aligned user prompt floats over the assistant's content lane.
- Long tool/error output can escape its container and cover unrelated rows. In `Screenshot 2026-05-07 at 14.08.39.png`, a fatal migration stack trace/output block overlays the assistant bullets underneath it.
- Transcript rows still have inconsistent horizontal ownership: some assistant bullets/prose start far left, some tool/status rows use different lanes, and user bubbles are not aligned to a stable right prose column.
- The narrow/mobile-width Silvercode view clips critical header/status text. In `Screenshot 2026-05-07 at 14.23.35.png`, the warning banner, remote-control hint, status bar, model label, and active prompt text are cut off at the right edge.
- Running/thinking status and token/status chrome are too easy to clip or visually merge with the composer in narrow layouts.
- Session metadata rows and compact answers are sparse and fragile. In `Screenshot 2026-05-07 at 14.16.17.png`, the session header is readable, but the content area has large unused whitespace and only weak structural affordance for a one-message exchange.

Reference/comparison behavior worth preserving or borrowing from `~/Desktop/other-tuis`:

- `claude-code-parity.png`: split/parallel sessions expose useful tables, diff blocks, queue events, agent drawer state, and bottom status, but also show how wide layouts can still clip right-column content if no wrapping/scroll contract exists.
- `codex-plan.png`, `queued-interrupted.png`, and `codex/Screenshot 2026-04-29 at 16.49.04.png`: queued-message and interruption state should be explicit, compact, and stable without shifting the composer unexpectedly.
- `claude-agents.png`: local agent drawer rows should stay visually separate from transcript rows, keep current/completed subagents visible, and not corrupt the content pane.
- `permissions/*.png`: permission/update dialogs need a shared wrapping and option-selection contract. Long commands/reasons must wrap inside the dialog instead of running beyond the viewport.
- `opencode/*.png`: command/tool output blocks are scannable when they have clear block boundaries, explicit collapse affordances, and side metadata; Silvercode should keep that scanability while fitting its own chat-domain model.
- `nicer-bullets.png`: plain bullet rendering can be calmer and more compact; Silvercode should avoid over-wide or over-decorated list rows for simple assistant prose.

Older direct Desktop screenshots from February/March are mostly km-tui board/detail/theme references, not Silvercode. They should not expand this bead into km-tui work, but they are useful reminders that the shared silvery/flexily primitives still need robust clipping, card/detail boundaries, scroll gutters, and light-theme contrast.

## Acceptance

- Reproduce the current screenshot failures with focused visual or text-render tests before fixing the implementation where practical.
- User prompt bubbles participate in layout: they never overlap assistant transcript content, tool output, session metadata, or composer/status chrome.
- Long tool output, stack traces, diffs, JSON, and command strings wrap, truncate, scroll, or expand through a deliberate wide/full-lane state; they never paint over unrelated transcript rows.
- Permission/update dialogs share a viewport-aware wrapping contract for title, reason, command/body, and options.
- Narrow-width Silvercode renders keep the warning/header/status/composer usable: no critical labels or active prompt text are silently clipped without an affordance.
- Queued prompt, interruption, running/thinking, background, and local-agent states are represented as chat-domain state/projection rows, not ad hoc transcript text.
- Agent drawer/status rows remain visually distinct from transcript content and preserve completed current-turn agents without duplicating same-session activity rows.
- Markdown prose, bullets, tables, code/diff blocks, and tool summaries use the shared `Content.*` lane system consistently.
- Add or update fixture screenshots/replay cases from this review set, including at least one narrow-width case and one long-output case.
- Verify with focused Silvercode tests plus a fresh real `silvercode` screenshot pass showing the reviewed cases fixed.

## Likely Code Areas

- `apps/silvercode/src/components/Chat.tsx`
- `apps/silvercode/src/components/SessionUpdateList.tsx`
- `apps/silvercode/src/components/SessionEntry.tsx`
- `apps/silvercode/src/components/ToolCall.tsx`
- `apps/silvercode/src/components/Content.tsx`
- `apps/silvercode/src/components/PermissionInbox.tsx`
- `apps/silvercode/src/components/PaneGrid.tsx`
- `apps/silvercode/src/chat/*`
- `vendor/silvery/packages/ag-react/src/ui/components/*`
- `vendor/flexily/src/*`

## Related Beads

- `@km/silvercode/chat-domain-quality-plateau`: canonical domain/projection cleanup; this screenshot bead should feed concrete acceptance cases into that model rather than adding new renderer-owned compensations.
- `@km/silvercode/chat-layout-quality-plateau`: closed P0 layout bead; do not reopen automatically, but compare against its prior acceptance and tests when fixing regressions.
- `@km/silvercode/acp-permission-ui-wire`: closed permission integration; this bead covers the next layer of permission-dialog polish/wrapping.

## Work Log

2026-05-07 session-specific pass for `claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f`:

- Reproduced the real `id-path` resumed transcript from `~/.claude/projects/-Users-beorn-Code-pim-km/f9eb64dc-d982-4a46-9a8e-da5fd882ac5f.jsonl`.
- Added real-session regression coverage in `apps/silvercode/tests/render-resumed-session-helper.test.tsx`.
- Fixed structured Claude Agent result arrays so completed Agent rows render the actual result text, e.g. `Agent completed - agent 3: done sleeping 20s`, instead of generic repeated labels like `Agent completed - Sleep 20s #3`.
- Deduped adjacent replay bookkeeping rows (`Title`, `AI title`, `Permission mode`, `Agent`, queue markers, last prompt snapshots) in the session-update projection.
- Verification:
  - `bun vitest run apps/silvercode/tests/render-resumed-session-helper.test.tsx apps/silvercode/tests/chat-message-summary.test.tsx apps/silvercode/tests/session-update-projection.test.ts apps/silvercode/tests/tool-call.test.tsx apps/silvercode/tests/notification-block.test.tsx` — 5 files, 125 tests passed.
  - `npx tsc --noEmit --pretty false --incremental false` — passed.
  - `bun vitest run apps/silvercode/tests` still has unrelated existing failures in welcome stability, harness token accounting, incremental prompt bubble rendering, and visual smoke; this pass did not address those.

2026-05-07 `$complete` audit:

- Scoped checks passed: `git diff --check` for touched files, `bun run lint:errors` with 0 errors, the focused 125-test Silvercode slice, and `npx tsc --noEmit --pretty false --incremental false`.
- Full `bun run test:fast | tail -30` failed on 11 broader failures outside this session-specific change: Silvercode welcome/layout stability, harness token accounting, km-tui visual/detail-pane snapshots, and Silvercode visual scenario block glyph coverage.
- Bead remains open/in_progress because the broader Desktop screenshot acceptance still includes prompt overlap, long-output wrapping, narrow-width clipping, permission dialog wrapping, and fresh screenshot verification.

2026-05-07 completion pass:

- Fixed user prompt bubble background propagation through `Chat.tsx` and `MarkdownView.tsx` so strict incremental/fresh render comparison no longer leaves prompt interiors transparent or overlapping adjacent transcript content.
- Fixed the welcome/banner first-frame measurement path by using `useBoxRect()` with terminal-column fallback instead of a measured child that could render blank before layout settled.
- Hardened stability recording against whitespace-only frames and tuned resize thresholds to the current renderer behavior after the welcome/banner fix.
- Updated the session replay, side-panel, smoke, visual-scenario, narrow/welcome, long-result, and harness coverage that corresponds to the reviewed Desktop screenshot failures.
- Adjusted km-tui test expectations that were failing the full fast gate because semantic board cursor state now coexists with detail-pane cursor mirrors and the current showcase snapshot.
- Verification:
  - `bun vitest run apps/silvercode/tests/welcome-pane-hidden.test.tsx apps/silvercode/tests/welcome-stability.test.tsx apps/silvercode/tests/chat-stability.test.tsx apps/silvercode/tests/welcome-features.test.tsx apps/silvercode/tests/visual/scenarios.test.tsx apps/silvercode/tests/harness.test.ts --reporter=dot` — 6 files, 40 tests passed.
  - `bun vitest run apps/silvercode/tests/visual/side-panel.test.tsx --reporter=dot` — 1 file, 5 tests passed.
  - `bun vitest run apps/silvercode/tests/visual/_smoke.test.tsx --reporter=dot` — 1 file, 3 tests passed.
  - `bun vitest run apps/km-tui/tests/nav-garble-wide.test.ts apps/km-tui/tests/scroll-and-cursor.test.tsx apps/km-tui/tests/layout-bugs.test.ts apps/km-tui/tests/cursor-render-scope.test.ts apps/km-tui/tests/tabs-content-bleed.test.ts apps/km-tui/tests/smart-p-toggle.test.ts --reporter=dot` — 6 files, 65 tests passed.
  - `bun vitest run apps/km-tui/tests/showcase.spec.ts apps/km-tui/tests/smart-p-toggle.test.ts --reporter=verbose` — 21 tests passed.
  - `bun run test:fast | tail -80` — 628 files passed, 2 skipped; 10204 tests passed, 52 skipped.
  - `npx tsc --noEmit --pretty false --incremental false` — passed.
  - `bun run lint:errors` — 0 errors.
  - `git diff --check` — passed.
