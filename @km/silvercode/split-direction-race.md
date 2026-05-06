---
mentions:
  - km
  - claude
id: "@km/silvercode/split-direction-race"
aliases:
  - km-silvercode.split-direction-race
  - km-silvercode-split-direction-race
created_by: claude:cc081a9a
created_at: 2026-04-28T17:06:32Z
closed_at: 2026-04-28T18:35:10Z
close_reason: >-
  Fixed: race-immune placeholder pre-place pattern (km commit 5c435bb9d).


  The chord handler is now the SOLE writer for new-leaf placement:

  - splitFocusedPane and splitPaneRightById synchronously insert a
  __pending_<rand> placeholder leaf in the user's chosen direction

  - When spawnSession resolves, .then() renames the placeholder to the real
  handle.id

  - reconcileTree (pane-layout.ts) preserves placeholders across drops and
  refuses to auto-append placeholder ids (isPlaceholderLeafId guard)


  Race-immune by construction. The tree always has the correct topology even
  during the spawn-in-flight window.


  L1 → L4 transition (per /big rubric): runtime guard catches symptom →
  architecture makes invalid state impossible.


  Verified:

  - apps/silvercode/tests/visual/pane-2d-layout.test.tsx: 3/3 GREEN (was 3/3
  fail)

  - silvercode tests: 90/91 files, 662/667 tests (only pre-existing skips)

  - whole vitest run: 465/465 files, 8458/8458 tests — zero regressions

  - vendor/silvery divider regression test: still 4/4 green


  The orthogonal silvery investigation (km-silvery.flexdirection-reuse-bug)
  confirmed silvery's flexDirection prop-reuse path is correct (5 STRICT tests
  pass) — bug was 100% App-side, as suspected.
started_at: 2026-04-28T17:16:03Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.split-direction-race
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T10:06:32Z
    created_by: claude:cc081a9a
    metadata: "{}"
  - issue_id: km-silvercode.split-direction-race
    depends_on_id: km-silvery.flexdirection-reuse-bug
    type: blocks
    created_at: 2026-04-28T10:28:50Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: km-silvery.flexdirection-reuse-bug
---

# [x] reconcileTree hardcodes 'row' for new-session append, ignoring user-requested split direction @km/silvercode #bug #P1 @claude:cc081a9a

blocks:: [[@km/silvercode]], [[@km/silvery/flexdirection-reuse-bug]]

apps/silvercode/src/pane-layout.ts:451 — when reconcileTree() appends a leaf for a new session, it always passes "row" as the split direction:

```
tree = splitLeaf(tree, rightmost, id, "row")
```

This races with the user's intended chord (Ctrl+G s = column-split, Ctrl+G v = row-split). When splitFocusedPane spawns a new session AND reconcileTree fires while the new session is being appended, the hardcoded "row" overrides the user's column intent.

Symptoms (apps/silvercode/tests/visual/pane-2d-layout.test.tsx — 3 failing):

- Ctrl+G s should produce a horizontal divider (─). Actual: vertical (│).
- Ctrl+G v then Ctrl+G s should produce both │ AND ─. Actual: only │.
- Ctrl+G z (zoom) sanity check expects both before zoom. Fails on missing ─.

Fix direction: thread the requested direction through to reconcileTree, or have splitFocusedPane defer reconcileTree until the splitLeaf placement is committed in the chord handler.

Discovered while fixing @km/silvercode/pane-2d-horizontal-divider (the divider RENDERING bug — that's fixed in silvery 639cc7fa + km 31de5c9c9). This is the orthogonal direction-routing bug uncovered after the visual fix.

Repro: bun vitest run apps/silvercode/tests/visual/pane-2d-layout.test.tsx

