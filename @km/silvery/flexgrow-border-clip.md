---
id: "@km/silvery/flexgrow-border-clip"
aliases:
  - km-silvery.flexgrow-border-clip
  - km-silvery-flexgrow-border-clip
created_by: claude:19080504
created_at: 2026-03-30T21:18:16Z
closed_at: 2026-03-30T21:52:30Z
close_reason: "Fixed: removed redundant EL (erase-to-end-of-line) from
  bufferToAnsi in output-phase.ts. The cursor enters pending-wrap after writing
  the last column, and EL in pending-wrap is terminal-dependent — some terminals
  wrapped first, clipping the border. Added 8 tests in
  border-edge-clipping.test.tsx."
---

# [x] flexGrow child right border clipped at terminal edge @km/silvery #bug #P3

When two flexGrow siblings both have borderStyle='single', the right border of the rightmost child is clipped (not visible) because flexGrow fills to the terminal edge without leaving room for the border character. Repro: tribe-watch.tsx sessions+detail panes side-by-side with flexGrow={3} and flexGrow={2}.