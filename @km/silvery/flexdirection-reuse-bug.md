---
id: "@km/silvery/flexdirection-reuse-bug"
aliases:
  - km-silvery.flexdirection-reuse-bug
  - km-silvery-flexdirection-reuse-bug
created_by: claude:cc081a9a
created_at: 2026-04-28T17:28:43Z
closed_at: 2026-04-28T18:27:32Z
close_reason: >-
  Not reproduced. Silvery agent (53e60c8d, agent a76049ad78574a30a, isolation:
  worktree) wrote 5 STRICT regression tests covering row→column, column→row,
  SplitRenderer-shaped wrapper, leaf→row→column, and alternating row↔column
  flexDirection prop changes. ALL 5 pass under SILVERY_STRICT=2. Reconciler path
  verified correct end-to-end:

  - helpers.ts:18 — flexDirection in LAYOUT_PROPS

  - host-config.ts:608 — classifyPropChanges flags layoutChanged: true

  - host-config.ts:620-628 — applyBoxProps runs

  - nodes.ts:616-626 — setFlexDirection called with new value

  - host-config.ts:627 — layoutNode.markDirty() invalidates flexily


  Test file: vendor/silvery/tests/features/box-flex-direction-reuse.test.tsx
  (silvery commit 5a0d2120, km bump d340bfa91).


  The pane-2d-layout test failure (only │, no ─) is 100% App-side. Refile any
  remaining symptom against km-silvercode (split-direction-race already covers
  it).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.flexdirection-reuse-bug
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-28T10:28:43Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] flexDirection prop change on reused Box doesn't update layout direction @km/silvery #bug #P1

blocks:: [[@km/silvery]]

When an AgNode is reused across renders (same key/position) but its `flexDirection` prop changes (e.g., 'row' → 'column'), the rendered output retains the old layout direction. The change is reflected in React's tree state but not in silvery's layout output.

Reproduction (from @km/silvercode/split-direction-race investigation):

1. App renders <Box flexDirection={tree.direction}> where tree.direction is initially 'row'
2. State update: tree.direction becomes 'column'
3. React reconciles: same Box at same position, prop flexDirection updated 'row' → 'column'
4. Expected: children stack top/bottom (column), divider renders as `─`
5. Actual: children remain side-by-side (row), divider still renders as `│`

Even adding `key={tree.direction}` to force remount does NOT fix this — the issue persists. Console tracing confirms paneTree.direction === 'column' at render time, but the silvery output represents row-split.

Discovered while fixing @km/silvercode/split-direction-race. The App-side race fix produces a correctly-shaped paneTree (verified via console.error inside the setPaneTree callback), but the terminal shows the old direction.

Repro environment: termless test harness in apps/silvercode/tests/visual/pane-2d-layout.test.tsx.

Likely areas to investigate:
- vendor/silvery/packages/ag-react/src/reconciler/ — commitUpdate for flex layout props
- vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts — how flexDirection is communicated to flexily
- vendor/silvery/packages/ag-react/src/hooks/useLayout.ts — does layout invalidate on flexDirection change?