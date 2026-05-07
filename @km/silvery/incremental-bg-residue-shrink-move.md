---
aliases:
  - km-silvery.incremental-bg-residue-shrink-move
  - km-silvery-incremental-bg-residue-shrink-move
created_at: 2026-05-07T04:32:19.963Z
---

# incremental render leaves stale bg residue when nodes shrink/move (Welcome→Chat transition, focus bar at row 22) #bug #P1

## Symptom

SILVERY_STRICT mismatch at cell (0, 22) when silvercode visual tests transition from Welcome screen → Chat content (queue-ux test renders 35 frames). Cell has bg=rgb(61,67,79) in incremental, bg=null in fresh. Cell character is space in both.

Reproduction:
```
bun vitest run apps/silvercode/tests/visual/queue-ux.test.tsx -t "wire format"
```

Diagnostic:
- Mismatch at (0, 22) on render #35
- Innermost node: 1×3 silvery-box at (0, 22)
- All dirty flags clean (contentDirty=false stylePropsDirty=false subtreeDirty=false childrenDirty=false)
- Path: 22 levels deep through chat composer
- WRITE TRAP: NO WRITES to (0,22) on this frame

## Hypothesis

The 1×3 box (likely focus bar / status indicator wrapper) had bg in a prior frame at (0, 22). On render #35, its position/size shifted (Welcome → Chat composer height change as queue items populate). The OLD position retains stale bg in the cloned prev buffer.

`clearExcessArea` should clear old-minus-new bounds, but the existing position-change guard skips it: "When a node MOVED (prev.x ≠ layout.x or prev.y ≠ layout.y), clearExcessArea is skipped entirely."

That guard delegates cleanup to the parent. But if no ancestor sets contentAreaAffected for the parent (e.g., subtreeDirty alone doesn't trigger it), the parent's clearNodeRegion never fires. Stale bg survives.

## Expected fix shape

When any descendant's prevLayout extends to coordinates not covered by current-frame source nodes, the closest containing ancestor with bg-source-coverage must trigger contentRegionCleared OR clearExcessArea must escalate to parent regardless of position-change.

Possibly: extend descendantOverflowChanged check to also detect "descendant's prev painted bg extends into ancestor area no longer source-painted" — currently only detects position overflow.

## Affected tests
- apps/silvercode/tests/visual/queue-ux.test.tsx (2 tests)
- apps/silvercode/tests/visual/queue-option-b.test.tsx (2 tests)

## Workaround currently in place
None — the harness's `incremental: false` workaround was reverted (NEVER work around silvery bugs). 4 silvercode tests currently fail with STRICT mismatch.

## Why P1
- Production users see paint flicker on view transitions (TUI focus changes, dialog open/close)
- Workaround surface area: `incremental: false` per renderer caller, or SILVERY_STRICT=0 in tests — both mask production bugs
- Same shape as fixed bugs: km-silvery.outline-incremental-clear (2026-04-28), km-silvery.cyan-strip-residue (the original `SILVERY_STRICT=residue` motivator)
