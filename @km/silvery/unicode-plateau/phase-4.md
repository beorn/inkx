---
id: "@km/silvery/unicode-plateau/phase-4"
aliases:
  - km-silvery.unicode-plateau.phase-4
  - km-silvery-unicode-plateau-phase-4
created_by: claude:c6244087
created_at: 2026-04-23T16:44:20Z
closed_at: 2026-04-23T16:47:41Z
close_reason: "Phase 4 shipped. detectInput absorbed into caps.input. Profile
  factory takes optional stdin. 5 new contract tests pin caps.input semantics. 0
  bare detector exports in @silvery/ansi detection surface. lint-env-reads: 0
  violations, 4-file allowlist. Silvery ad727819."
---

# [x] Unicode plateau Phase 4: caps.input symmetry (absorb detectInput) @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery/unicode-plateau]], [[@km/silvery/unicode-plateau/phase-3]]

Per /big plateau check. Adds caps.input for symmetry with caps.cursor; deletes detectInput. Profile factory gains optional stdin argument. Small scope: ~15 LOC across detection.ts, profile.ts, term.ts, re-exports. Follow-up to the main 3-phase plateau. Criteria: rg detectInput vendor/silvery/packages → 0 runtime hits; caps.input contract test; lint passes.