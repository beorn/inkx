---
id: "@km/silvery/wide-emoji-continuation-cell-stale"
aliases:
  - km-silvery.wide-emoji-continuation-cell-stale
  - km-silvery-wide-emoji-continuation-cell-stale
created_by: claude:019d032d
created_at: 2026-04-22T20:43:37Z
owner: bjorn@stabell.org
---

# [ ] Wide emoji continuation cells retain stale chars when right-justified sibling reflows @km/silvery #bug #P3

When a Box with `justifyContent="flex-end"` contains Text siblings and one Text shrinks in width across renders, the whole group shifts right. If a Text starts with a wide emoji (width 2), the emoji's continuation cell lands at a column that held a narrow letter in the prior longer render. The incremental output pipeline doesn't clear that cell — the buffer has the new emoji but the terminal still shows the stale letter in the continuation slot.

Reproduction: apps/@km/tui/tests/repro-status-bar-termless.test.tsx (earlier WIP versions reproduced reliably; current version passes after @km/tui workaround).

Observed: `📋t 1` / `📄i 4` — letters from 'starting'/'syncing' appear in the continuation cell of 📋/📄 after the suffix shrinks.

Workaround (applied in @km/tui, not silvery): add explicit space between emoji and number (`📋 {N}`), split watcher-status into stable-width fragments, pad the suffix to a fixed width so the parent group doesn't reflow.

Root cause (needs silvery investigation): likely in vendor/silvery/packages/ag-term/src/pipeline/render-text.ts or output-phase.ts — when a Text shifts position AND shrinks at the right edge, the continuation cell of a leading wide emoji gets skipped in the change pool even though its position differs from the clone buffer. SILVERY_STRICT=1 does NOT catch this (fresh and incremental both produce the same bug), so fresh-render ALSO fails to clear the cell — may be a shared bug in how render-text writes continuation cells after layout shift.

Related: @km/tui/status-bar-stray-chars (blocked-on workaround).