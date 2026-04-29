---
id: "@km/tui/body-block-leading-gap"
aliases:
  - km-tui.body-block-leading-gap
  - km-tui-body-block-leading-gap
created_by: claude:8b5b9e1c
created_at: 2026-04-21T01:34:06Z
closed_at: 2026-04-21T02:05:21Z
close_reason: >-
  Fixed by 8e8fac337 (fix: remove phantom whitespace between consecutive body
  blocks) + 796e4dc6b (test: failing test).


  Root cause

  ----------

  Body-block branch in apps/km-tui/src/views/CardColumn.tsx applied
  `paddingTop={1}` unconditionally to every body-block Box. That creates 1 blank
  row above every body block, including when the previous sibling is ALSO a body
  block. Between two borderless prose blocks the leading blank reads as phantom
  whitespace.


  The `isPrevBodyBlock` prop was already computed in `Column.renderItem` and
  threaded through `Card` — but never read. Classic
  dead-code-with-an-obvious-intended-use pattern.


  Fix

  ---

  `paddingTop={isPrevBodyBlock ? 0 : 1}`. Three-case rationale documented in the
  comment:

  - prev structural card: paddingTop=1 → separate borderless body from the
  structural border above

  - prev column header: paddingTop=1 → don't crowd the header separator

  - prev body block: paddingTop=0 → abut, read as stacked prose


  Selection bg still forms a continuous highlight across cursor/multi-select
  runs because blocks literally abut (no gap to miss).


  Test

  ----

  apps/km-tui/tests/body-block-spacing.slow.test.tsx (new, 4 tests):

  1. consecutive body blocks: 0 blank rows between them (the fix)

  2. body → structural: ≤1 blank row (preserved)

  3. body+overflow indicator → structural: ≤1 blank row (preserved)

  4. truncated body (···) → structural: ≤1 blank row (preserved)


  Test 1 fails on HEAD with paddingTop={1}; passes after fix. Other 3 preserved
  as regression guards so the fix can't accidentally tighten the structural-card
  transitions.


  Verification

  ------------

  - bun vitest run --project slow
  apps/km-tui/tests/body-block-spacing.slow.test.tsx: 4/4 pass (individually;
  see note below)

  - bun vitest run --project slow
  apps/km-tui/tests/body-card-truncation.slow.test.tsx: 4/4 pass

  - bun vitest run apps/km-tui/tests/scroll-and-cursor.test.tsx: 27/27 pass

  - bun vitest run apps/km-tui/tests/showcase.spec.ts: 15/15 pass (snapshot
  updated to reflect tighter spacing)

  - bun vitest run apps/km-tui/tests/board-render.test.ts
  apps/km-tui/tests/column-rendering.test.ts
  apps/km-tui/tests/card-bg-inheritance.test.ts: 46 pass, 2 skipped

  - npx tsc --noEmit (non-vendor): 0 errors

  - Real-vault TTY at 240x117 on ~/Bear/Vault: before/after screenshots in
  /tmp/km-body-block-{before,after}-fix.png show the @agent column's body-block
  run (Task board… / How to use… / Grooming rule…) now abuts instead of carrying
  blank rows between each pair.


  Snapshot update

  ---------------

  apps/km-tui/tests/__snapshots__/showcase.spec.ts.snap updated: the Visual
  Regression > initial-kanban / after-cursor-down snapshots previously showed a
  blank row between "Buy groceries" and "Call dentist" (both body-block-rendered
  tasks in the Todo column). They now abut — that tightness IS the fix.


  Scope discipline

  ----------------

  - Touched only apps/km-tui/src/views/CardColumn.tsx (1-line contract change)
  and test/snapshot. No silvery work. No TreeNode changes.

  - The pre-existing card-rendering.slow.test.ts failures (unselected/selected
  body card border expectations, date-badge right border overflow, emoji content
  garble) reproduce on HEAD WITHOUT my change — they're unrelated.


  Note: vendor/silvery/packages/ag-react/src/hooks/useVirtualizer.ts line 376
  has an in-progress debug `console.error("VIRT_CB", ...)` from a sibling
  agent's work on km-silvery.virtualizer-from-layout. It trips vitest's
  forbidden-console-output check when aggregate runs accumulate virtualizer
  callbacks. Individual test runs are clean. Not in scope for this bead; sibling
  agent owns it.
---

# [x] [bug] Body blocks in columns render with phantom whitespace above @km/tui #bug #P2 @claude:8b5b9e1c

When a column contains unframed body blocks (plain text, no card border) intermixed with bordered cards, the body blocks render with 3-4 rows of blank space above them. Not the virtualizer-divergence bug class — these blocks are visible, just mis-positioned.

Reproduced at 240x117 on ~/Bear/Vault/@next.md. Column 'Agent Next Actions @agent' shows pattern: [body block A] + gap + [body block B] + gap + [§ bordered card].

Evidence: ~/Desktop/Screenshot 2026-04-20 at 18.33.01.png

Hypothesis: column item-gap logic treats bordered cards and unframed body blocks differently, OR body blocks carry phantom padding (e.g., reserved border space with borderStyle=none). Investigate CardColumn body-branch render vs structural-branch render — may relate to the maxRows refactor just landed (237607540) or pre-existing.

Separate from @km/tui/column-top-tall-terminal-variant (that one is architectural virtualizer divergence, blank body bleeding; this one is leading whitespace on rendered body blocks).