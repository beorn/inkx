---
mentions:
  - km
id: "@km/silvery/layout-quality-plateau"
aliases:
  - km-silvery.layout-quality-plateau
  - km-silvery-layout-quality-plateau
created_by: Bjørn Stabell
created_at: 2026-04-12T07:46:36Z
closed_at: 2026-04-12T08:51:33Z
close_reason: "All 4 phases complete. Phase 1: delete layoutDirty (-90 lines).
  Phase 2: delete executeRender (-215 lines). Phase 3: STRICT overflow invariant
  (+55 lines). Phase 4: Flexily native fit-content (+99 Flexily, simplified
  silvery). Total: clean pipeline with one API (createAg), one dirty source
  (Flexily isDirty), reactive layout hooks (alien-signals), and native
  fit-content."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.layout-quality-plateau
    depends_on_id: km-silvery.reactive-pipeline
    type: parent-child
    created_at: 2026-04-12T00:49:04Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.reactive-pipeline
---

# [x] Layout quality plateau — 4 phases to clean pipeline @km/silvery #epic #P1

blocks:: [[@km/silvery/reactive-pipeline]]

Layout quality plateau — clean the pipeline by completing the signals migration for layout and eliminating polyfills.

The render cascade already uses alien-signals (reactive-node.ts). The layout dirty tracking does NOT — it still uses the manual layoutDirty + trackLayoutDirty system, duplicating what Flexily isDirty() already provides. This caused the fit-content session's main bug.

4 phases:

Phase 1 (P0): Delete silvery layoutDirty — use Flexily isDirty() as sole layout gate
  Bead: @km/silvery/test-runtime-parity
  This aligns layout gating with the reactive pipeline vision: Flexily isDirty() is the signal source for "does layout need to run." No alien-signals wrapper needed — Flexily's propagation is already reliable. When the full reactive graph ships, isDirty() becomes a signal input.
  ~-50 lines deletion.

Phase 2 (P1): Delete executeRender — one API (createAg)
  Bead: @km/silvery/delete-execute-render
  ~-200 lines. No duplicate orchestrators.

Phase 3 (P1): STRICT layout overflow invariant
  Bead: @km/silvery/strict-layout-overflow
  ~50 lines additive. Safety net.

Phase 4 (P2): Flexily native fit-content
  Bead: @km/flexily/native-fit-content
  ~200 lines in Flexily, ~-290 lines deleted from measure-phase.ts. The plateau.

Relationship to reactive-pipeline epic: Phase 1 completes the layout portion of the signals migration by making Flexily the single dirty source. Phases 2-4 simplify the pipeline surface that the full reactive graph will eventually replace.

/complete: grep fitContentCorrectionPass → 0 hits, grep trackLayoutDirty → 0 hits, grep executeRender → 0 hits (except docs). SILVERY_STRICT=1 test:fast passes.

