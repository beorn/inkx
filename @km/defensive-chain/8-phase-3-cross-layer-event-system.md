---
id: "@km/defensive-chain/8-phase-3-cross-layer-event-system"
aliases:
  - km-defensive-chain.8
  - km-defensive-chain-8
  - "@km/defensive-chain/8"
created_at: 2026-01-25T12:12:13Z
closed_at: 2026-01-25T12:49:29Z
---

# [x] Phase 3: Cross-layer event system @km/defensive-chain #task #P2 @beorn-49853

Implement event emitter for cross-layer communication (parse errors, sync warnings).

See plan Phase 3: .claude/plans/swirling-launching-chipmunk.md

Research:
- Evaluate nanoevents vs mitt vs emittery
- Plan BroadcastChannel integration for workers

Implementation:
- Add event system to @km/core
- Define UserEvent, DebugEvent, MetricEvent types
- Wire up storage layer events
- Display events in UI