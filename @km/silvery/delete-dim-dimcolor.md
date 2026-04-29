---
id: "@km/silvery/delete-dim-dimcolor"
aliases:
  - km-silvery.delete-dim-dimcolor
  - km-silvery-delete-dim-dimcolor
created_at: 2026-04-21T05:57:30Z
closed_at: 2026-04-23T22:04:29Z
close_reason: 3a8f0aad silvery + 72bdfb502 km bump — StyleProps.dim and
  StyleProps.dimColor deleted; pipeline consumers stripped (render-phase,
  render-phase-adapter, render-text, render-helpers); DecorationStyle.dimColor
  deleted; 30+ silvery tests/examples migrated to $muted; CellAttrs.dim kept
  (internal SGR 2 bit, still stamped by token resolution at ANSI 16 / mono
  tiers). 2523 km-tui + 46 STRICT ag-react + 8 listview-overscroll-bump tests
  pass; tsc unchanged (113 pre-existing).
dependencies:
  - issue_id: km-silvery.delete-dim-dimcolor
    depends_on_id: km-all.plateau
    type: parent-child
    created_at: 2026-04-20T22:58:01Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Delete silvery types.ts::dim + dimColor StyleProps — migrate to semantic tokens ($muted, $faint via <Small>, $disabledfg) @km/silvery #task #P3

blocks:: [[@km/all/plateau]]
