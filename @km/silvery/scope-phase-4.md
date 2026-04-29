---
id: "@km/silvery/scope-phase-4"
aliases:
  - km-silvery.scope-phase-4
  - km-silvery-scope-phase-4
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:34Z
closed_at: 2026-04-24T23:32:02Z
close_reason: All 7 child beads complete (4.A ESLint @ km 1f317889a, leak
  detector @ silvery 2b0880ef + km b85436093, 4.B/D/E km doc audit @ km
  2e6a69a42, 4.C silvery docs @ silvery 85cb8ca6, 4.F migration guide @ silvery
  98472d04, 4.G grep clean / N/A). DEPENDS ON Phase 3.x edges were directionally
  backwards in the original plan — Phase 4.A was meant to gate Phase 3.2 timer
  migration, not vice versa. --force used because Phase 3 sub-beads stay open
  with their own gating (silvercode, lint-informed triage).
---

# [x] Phase 4: Enforcement + systematic doc/example audit @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-3-abort]], [[@km/silvery/scope-phase-3-node-io]], [[@km/silvery/scope-phase-3-signals]], [[@km/silvery/scope-phase-3-stores]], [[@km/silvery/scope-phase-3-subroots]], [[@km/silvery/scope-phase-3-timers]], [[@km/silvery/scope-phase-3-useexit]]

Lock the pattern with one ESLint gate + one doc sweep. See hub/silvery/design/lifecycle-scope.md § Phase 4. Sub-beads run in parallel after the ESLint rule lands.