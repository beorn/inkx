---
aliases:
  - km-tui.cursor-visible-once-on-enter
  - km-tui-cursor-visible-once-on-enter
created_at: 2026-05-09T01:24:29.307Z
---

# cursor-visible-once invariant fails after Enter into edit mode (3 tests) #bug #P1

## Symptom

`RenderInvariantError: Render invariant violation [cursor-visible-once]: expected exactly one visible rendered cursor after press("Enter"); found 0`

The post-`Enter` frame has zero visible cursors when entering text-edit mode. Three tests in three different surfaces all hit it on the same action — entering edit mode via `Enter`. After the regression, no rendered cursor appears in the output.

## Affected tests

- `apps/km-tui/tests/escape-layering.test.ts:301` — "Escape exits inline edit before closing local find (regression)"; cursor=alpha
- `apps/km-tui/tests/text-cursor-bugs.spec.ts:77` — "stickyX preserved when crossing blocks vertically"; cursor=shortA
- `apps/km-tui/tests/hr.test.ts:352` — "HR remains borderless in edit mode (flat body block)"; cursor=my-hr

All three failures fire from `pressKey` → `press` → `checkRenderInvariants` → `RenderInvariantError("cursor-visible-once")` at `apps/km-tui/src/render-invariants.ts:47`.

## Suspect

`e58f0fab4 feat(km-tui): cursor-occurrence-path WIP + render invariants + worktree groom` — the WIP cursor-occurrence-path work changed how the rendered cursor is enumerated/projected; the post-`Enter` text-edit-mode entry path no longer emits a visible cursor mark in the rendered tree.

The commit message labels the work as WIP, so this is the expected kind of breakage to surface in test:fast — it just hasn't been triaged + closed.

## Acceptance

- After `press("Enter")` on a card / text node / HR, exactly one visible cursor exists in the rendered frame.
- The three tests above pass without modification.
- Render invariant gate (`SILVERY_STRICT=1`) stays green for the showcase test (`apps/km-tui/tests/showcase.spec.ts`) and termless cursor tests.

Diagnosis only — leaving fix to the cursor-occurrence-path author. Filed during chief's `test:fast` triage assignment.
