---
id: "@km/all/unified-selection"
aliases:
  - km-all.unified-selection
  - km-all-unified-selection
created_by: Bjørn Stabell
created_at: 2026-04-11T00:40:57Z
closed_at: 2026-04-18T08:16:07Z
close_reason: "Phase 0 shipped on feat/selection-plateau: Selection union +
  setSelection dispatcher. See commit 7a6367c86."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-all.unified-selection
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T08:36:40Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Unified Selection type: TextSelection | NodeSelection | GapSelection on BoardState @km/all #feature #P0 @Bjørn Stabell

blocks:: [[@km/silvery/selection-focus-plateau]]

Replace the three independent selection channels (sel.text, sel.node, implicit mode) with a single Selection discriminated union on BoardState.

Current: 208 call sites across 20 files manually coordinate sel.text.edit(), sel.node.select(), sel.text.deselect(). Every structural operation during editing must remember to re-enter edit mode — 7 instances forgot in the 0410 session alone.

Target:
- Selection = TextSelection | NodeSelection | GapSelection (defined in docs/design/tea-state-machines.md)
- Lives on BoardState as a reactive projection over @silvery/selection
- One dispatch point: setSelection(sel) — no three-way coordination
- Mode (node vs text) is derived from selection type, not implicit

Dependencies: none (this is the foundation)