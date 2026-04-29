---
id: "@km/silvery/sterling-cursor-adaptive"
aliases:
  - km-silvery.sterling-cursor-adaptive
  - km-silvery-sterling-cursor-adaptive
created_by: claude:4274df30
created_at: 2026-04-20T18:39:27Z
closed_at: 2026-04-25T07:04:16Z
close_reason: "Fixed in silvery c0072dae: new repairCursorBg ΔE≥0.15 with 0.005
  safety margin (handles one-half-light OKLCH→hex round-trip quantization).
  78/84 → 84/84."
started_at: 2026-04-25T06:43:56Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-cursor-adaptive
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:12:58Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-cursor-adaptive
    depends_on_id: km-silvery.sterling-2e-interior-migration
    type: blocks
    created_at: 2026-04-24T16:16:08Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [x] Sterling: cursor derivation needs repairCursorBg pass @km/silvery #bug #P2 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-2e-interior-migration]]

Surfaced 2026-04-20 by Sterling 2e Phase A audit (commit cc33ef9e in vendor/silvery).

## Problem

Sterling's cursor derivation passes scheme.cursorText / cursorColor verbatim. 6 schemes fail AA on fg-cursor / bg-cursor pair: zenburn, tokyo-night-day, serendipity-midnight, serendipity-morning, one-light, one-half-light.

Legacy derivation ran a repairCursorBg pass (lift cursor.bg L until contrast against fg-cursor passes AA).

## Fix

In packages/theme/src/sterling/derive.ts, port the repairCursorBg logic. Apply ensureContrast to the cursor pair.

## Acceptance

- Above 6 schemes pass WCAG AA on cursor pair
- All 84 schemes pass cursor contrast in strict mode
- Cursor visibility maintained across all schemes (sanity-check render)

Parent: @km/silvery/theme-v4