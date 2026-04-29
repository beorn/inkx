---
id: "@km/all/item-as-object"
aliases:
  - km-all.item-as-object
  - km-all-item-as-object
created_by: Bjørn Stabell
created_at: 2026-04-01T18:26:56Z
closed_at: 2026-04-01T22:23:28Z
close_reason: "Commit 1a69030e: item?: boolean → item?: ItemData. 189 files,
  5134 tests pass. DB unchanged (flat columns, TS mapping layer)."
owner: bjorn@stabell.org
---

# [x] Explore: item as object { list?, task?, embed? } instead of top-level fields @km/all #task #P2

Currently item-specific properties (list_marker, task_marker, task_status, embed_source) are top-level KNode fields. Proposal: group them under item: { list?, task?, embed? }. Blocks don't have the item field at all.

Benefits: cleaner data boundary, single type check for item vs block, no scattered fields.
Risk: large migration — touches every consumer of task_marker/list_marker/embed_source.
Prerequisite: CursorContext (@km/tui/cursor-context) — do that first.