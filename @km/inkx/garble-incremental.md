---
id: "@km/inkx/garble-incremental"
aliases:
  - km-inkx.garble-incremental
  - km-inkx-garble-incremental
created_by: claude:23485adf
created_at: 2026-02-24T15:42:09Z
closed_at: 2026-02-24T19:48:36Z
owner: bjorn@stabell.org
assignee: claude:23485adf
---

# [x] Incremental rendering garble: clearOps overwrite text content after column resize @km/inkx #bug #P1 @claude:23485adf

## Symptom
Screen garbles progressively when navigating with h/j/k/l in km TUI. First visible on pressing 'l' (cursor_right) in Asana vault.

## Reproduction
- `INKX_STRICT=1 bun km view --repo imports/asana stabell` → press 'l' → crashes with MISMATCH
- Only reproduces in createApp (TTY/production), NOT in createRenderer (TUI tests)
- TUI tests with `checkIncremental: true` all pass — the bug is createApp-specific

## Root Cause Analysis (in progress)
**Mismatch at (28, 13)**:
- incremental: `char=" "` (space, no styling)
- fresh: `char="e"` fg=6 (cyan), dim, underline (hyperlink)

**Node at row 13**: `rect=2,13 34x1 prev=2,13 36x1` — shrank from width 36→34
- `hasPrev=false ancClr=true` — ancestor cleared, no previous buffer
- All nodes in the column show this pattern

**Key observation**: Same InkxNode tree produces DIFFERENT text content:
- Incremental: "happylatte" (10 chars)
- Fresh: "happylatteetti" (14 chars)

**Content phase stats**: 
- Incremental: 1055 visited, 619 rendered, 0 skipped, 450 clearOps
- Fresh: 1055 visited, 619 rendered, 0 skipped, 0 clearOps

**Clearing analysis**: `clearNodeRegion` and `clearExcessArea` both run BEFORE text rendering (correct order). The 450 clearOps come from `ancestorCleared` cascade propagating through the entire subtree. The clearing logic itself appears correct — clears excess area outside new bounds only.

**Current hypothesis**: `renderText()` or text content collection produces different output for the same node tree in incremental vs fresh mode. Need to trace the text rendering path.

## Fixes shipped
- `skipScrollStateUpdates: true` in create-app.tsx INKX_STRICT fresh render (was corrupting scroll state on shared nodes)

## What's NOT the cause
- Phase 2 of commit 6e35fe2 (Box useLayoutEffect mount-only) — tested, same mismatch
- Phase 3 of commit 6e35fe2 — already reverted
- Clearing order — clears run before renders
- clearExcessArea coordinates — only clears outside new bounds

## Open questions
1. Why does renderText produce different content for the same InkxNode in incremental vs fresh?
2. Is there a prevLayout-dependent code path in text collection?
3. Can this be reproduced in TUI tests? (createRenderer path doesn't trigger it)