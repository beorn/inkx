---
id: "@km/_orphan/ej0p"
aliases:
  - km-ej0p
created_at: 2026-01-21T09:44:34Z
closed_at: 2026-01-21T09:58:10Z
---

# [x] Add selectedNodeId to BoardState @km/_orphan #task #P0

Phase 1 of cursor redesign: Add selectedNodeId: string | null to BoardState as the single source of truth for which node is selected. Keep cursor: TPath for backward compatibility and sync them initially.