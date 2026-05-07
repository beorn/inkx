---
mentions:
  - km
closed_at: 2026-05-06T23:10:43.443Z
closeReason: "shipped ca07323fc on origin/main: structured TestApp tree
  snapshots, duplicate-title strictness for title handles, dispatch demoted to
  deprecated/internal escape hatch, toBell matcher, and typed test.extend docs.
  Evidence: origin/main greps for snapshotTree/expectTreeSnapshot,
  duplicate-title strictness, @deprecated dispatch, toBell, and test.extend all
  pass. Tests: bun vitest run apps/km-tui/tests/tree-snapshot.test.ts
  apps/km-tui/tests/matchers.test.ts apps/km-tui/tests/column-rendering.test.ts
  => 65 passed, 1 skipped; bun run test:fast => typecheck OK, 609 passed, 2
  skipped."
---

# [x] Phase 6: TestApp API refinement — shrink surface, improve ergonomics @km/all #task #P2

blocks:: [[@km/infra/test-system]]

## Goal

Refine the TestApp API based on Pro review findings. Less surface area, sharper signals, better failure messages.

## Items (from parent bead @km/infra/test-system Phase 6 + Pro review)

1. Structured UI-tree snapshots (like Playwright ARIA snapshots)
- Snapshot the semantic tree (board > column > card [cursor]), not raw terminal cells
- Raw snapshots only for renderer-specific tests
- Format:
     view=cards focus=board overlay=null
  > column: col1
  > task: task1 [cursor]
  > task: task2
18. Locator strictness: single-target ops throw on multiple matches (Playwright model)
19. Shrink TestApp surface:
- Cut aliases
- Move expect* methods to vitest matchers
- Demote dispatch() (prefer press/command which route through the real kb handler)
40. Vitest test.extend for typed fixtures + cleanup hooks
41. bell as counter → toBell() matcher (Pro finding #15)
42. Distinguish command() from press() semantically (Pro finding #16)
43. app.card(title) → app.node(id) for stable refs, card(title) convenience only (Pro finding #17)

## /complete criteria

- Structured UI-tree snapshot API shipped with tests
- Locator count>1 throws for single-target ops
- TestApp.dispatch() demoted (removed or marked internal)
- Vitest test.extend fixture pattern documented
- toBell() matcher shipped

## Progress 2026-05-06

- Shipped `TestApp.snapshotTree()` + `expectTreeSnapshot()` for structured semantic board snapshots.
- Added duplicate-title strictness for `app.card(title)` / `app.column(title)`; tests must use `app.node(id)` when titles are ambiguous.
- Marked `TestApp.dispatch()` as a deprecated/internal escape hatch; `press()` and `command()` remain the real keyboard-handler paths.
- Added `expect(app).toBell(expectedCount?)` alongside the existing `toHaveBell()` matcher.
- Documented typed `vitest` `test.extend` fixture usage in `apps/km-tui/tests/CLAUDE.md`.

Evidence:

- `bun vitest run apps/km-tui/tests/tree-snapshot.test.ts apps/km-tui/tests/matchers.test.ts apps/km-tui/tests/helpers/create-test-app.test.ts apps/silvercode/packages/agent-harness/tests/agent-backends.test.ts apps/silvercode/packages/agent-harness/tests/backend-spec-runner.test.ts apps/silvercode/packages/agent-harness/tests/chat-provider.test.ts apps/silvercode/tests/backend-contracts/config-options.contract.test.ts apps/silvercode/tests/backend-contracts/prompt.contract.test.ts apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts` → 9 files / 54 tests pass.
- `npx tsc --noEmit --pretty false` blocked by unrelated existing errors in `apps/silvercode/tests/chat-types.test.ts`.
- `bun run typecheck:check` blocked by unrelated existing errors in `apps/silvercode/tests/chat-types.test.ts` and `apps/silvercode/tests/prompt-assembly-boundary.test.ts`.

blocks:: [[@km/infra/test-system]]

