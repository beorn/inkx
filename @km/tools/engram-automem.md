---
mentions:
  - km
id: "@km/tools/engram-automem"
aliases:
  - km-tools.engram-automem
  - km-tools-engram-automem
created_at: 2026-02-07T11:02:47Z
closed_at: 2026-02-15T14:51:59Z
---

# [x] Analysis: evaluate ENGRAM/AutoMem/Hindsight memory designs for km recall @km/tools #task #P4

Evaluate whether ENGRAM/AutoMem/Hindsight memory designs (researched in ../cloudi) could improve km recall/session memory.

## Context

- cloudi/docs/research/memory-systems.md — comparative research on SOTA memory systems
- cloudi/specs/active/ADR01/ — architecture decision records with implementation specs

## Systems to evaluate

1. **ENGRAM** (77.55% LoCoMo): Per-category retrieval separating facts/events/instructions. K≈25 per type prevents cross-type interference.
2. **AutoMem** (90.53% LoCoMo): Hybrid graph+vector dual-storage with 9-signal scoring. Requires FalkorDB+Qdrant.
3. **Hindsight** (91.4% LongMemEval): Biomimetic 4-network memory (world/experiences/entity summaries/beliefs) with TEMPR multi-pathway retrieval.

## Concrete opportunities for km

- ENGRAM cognitive type separation (fact/event/instruction) for session memories
- Confidence accumulation (weight facts by cross-session mentions)
- Hybrid retrieval (semantic + keyword + temporal) vs current flat FTS5
- Background consolidation cycles (gisting, compression, forgetting)

## Deliverable

Analysis document comparing current km recall architecture with these designs. Estimate effort vs accuracy gain for each opportunity.

