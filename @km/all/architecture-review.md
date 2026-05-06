---
mentions:
  - km
  - Bjørn
id: "@km/all/architecture-review"
aliases:
  - km-all.architecture-review
  - km-all-architecture-review
created_by: Bjørn Stabell
created_at: 2026-04-02T00:00:34Z
closed_at: 2026-04-02T03:49:22Z
close_reason: Three-pass review complete. Findings at
  docs/architecture-review-findings.md. All 5 simplification opportunities
  addressed via km-all.simplification epic (now closed).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Three-pass architectural review for dramatic simplification @km/all #task #P2 @Bjørn Stabell

Three-pass architectural review of km codebase. Findings at docs/architecture-review-findings.md.

PASS 1 — INVENTORY:

- 7 node types (3 redundant: CardView/ColumnView overlap ViewNode, TNode duplicated in @km/_orphan/repl)
- 7 cursor/position types, 3 separate BoardState definitions that have drifted
- Body: 12 files, ~142 occurrences. Embed: 41 files, ~200+. Collapse: 26 files (isCollapsedChild duplicated)
- Key redundancy: 3 independent embed resolution paths, extractBody reimplemented in view-navigation

PASS 2 — FLOWS:

- Read: extractBody called 3x per render, two parallel pipeline architectures
- Edit: entire file re-serialized on any field change
- Navigate: THE hotspot — extractBody re-derived every navigation, cursor classified twice, ViewNode built but legacy still primary
- Sync: complete file re-parse on any change, two reconciliation implementations, 60s heartbeat as third path

PASS 3 — COMPOSITION:

- 10 cross-cutting concerns. Most pervasive: embeds (41 files), cursor (35), fold (30)
- Easy to extract as middleware: search, move mode, edit mode, hidden nodes
- Hard: cursor (IS the core), fold (4-way entanglement), embeds (all layers), undo (2 competing mechanisms)
- ViewNode addresses: body detection, collapse, embed visual resolution, cursor classification, navigation
- ViewNode doesn't address: undo, fold, hidden nodes, runtime collapse, per-column memoization

TOP 5 SIMPLIFICATION OPPORTUNITIES:

1. Unify column derivation (eliminate use-columns.ts duplication) — ~400 lines, IS Phase 3 target
2. Unify cursor classification (ViewNode replaces deriveCursorAncestors) — ~180 lines
3. Simplify navigation via ViewNode tree — ~500 lines
4. Consolidate undo mechanisms — ~200 lines
5. Filter hidden nodes in ViewNode tree — ~50 lines, natural Phase 3b

Gravity well: board-actions.ts (2647 lines) touches 8/10 concerns

