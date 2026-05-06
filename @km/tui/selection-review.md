---
mentions:
  - km
  - Bjørn
id: "@km/tui/selection-review"
aliases:
  - km-tui.selection-review
  - km-tui-selection-review
created_by: Bjørn Stabell
created_at: 2026-04-03T07:41:08Z
closed_at: 2026-04-03T08:34:43Z
close_reason: SelectionEngine extracted (expandWithDescendants, removeNesting,
  getRange, getSiblings) with 24 tests. Wired into reactive.ts and
  board-actions-selection.ts. Commit f5027677.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Review shift/extend and click/multi-selection against Decker and best practices @km/tui #task #P2 @Bjørn Stabell

Thorough review of km's selection model — shift-extend, click-select, multi-select, area-select.

Review against:

1. Decker's approach:
- removeNesting() in areaselect.ts (dedup children when parent selected)
- selectedIds as flat source of truth + per-item derived state
- Area select with disjunctiveUnion for extend mode
- DOM-based spatial selection (isTouching, isContaining)
7. Best practices from VS Code, Notion, Asana, Finder:
- Click = select single
- Shift+click = range select (anchor to focus)
- Cmd+click = toggle individual in set
- Shift+arrow = extend selection by one
- Range walk algorithm: getSelectionRange(anchor, focus) → string[]
14. km's current state:
- multiSelected: Set<string> with expandWithDescendants()
- handleExtendSelectVertical adds one at a time (no range jump)
- syncMultiSelected diffs signals
- Pop-out to parent at sibling boundary (just implemented)

Deliverables:

- Gap analysis: what km is missing vs Decker + industry standard
- Algorithm: derive full visual selection from anchor+focus (range walk)
- Recommendations for removeNesting equivalent (tree-aware dedup)
- Test coverage for edge cases (cross-level, nested, boundary)

