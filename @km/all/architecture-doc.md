---
id: "@km/all/architecture-doc"
aliases:
  - km-all.architecture-doc
  - km-all-architecture-doc
created_by: Bjørn Stabell
created_at: 2026-04-02T00:00:16Z
closed_at: 2026-04-02T03:49:21Z
close_reason: docs/architecture.md replaced with v2 content (commit 53c127e6).
  271 lines, ViewNode, building blocks, flows, composition model.
---

# [x] Concise architecture synthesis doc (km + silvery reference) @km/all #task #P2 @Bjørn Stabell

Create one concise (~250 line) architecture doc that synthesizes km's full structure and flows.

DELIVERABLES COMPLETE:
1. docs/architecture-v2.md (271 lines) — building blocks (KNode, Position, Repo, BoardState, ViewNode), 5-layer stack, 4 data flows, composition model with SlateJS alignment table, package map
2. vendor/silvery/docs/architecture.md (113 lines) — silvery framework internals

UPDATES IN THIS PASS:
- Added ViewNode to Building Blocks (lines 101-117) with role types, buildViewTree, buildViewIndex, deriveCursorPath
- Marked ColumnView/CardView as 'Legacy View Models' (line 92)
- Updated Navigate flow to show dual-path (legacy + ViewNode with equivalence check)
- Added 'Active migration: ViewNode tree' section in Composition Model
- Trimmed from 302 to 271 lines (compressed Position, combined BoardAction/CommandAction, tightened code blocks)
- Verified all file references exist

REMAINING: Close after view-tree migration Phase 3 — then remove 'Legacy' labels and 'migration in progress' notes