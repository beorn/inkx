---
id: "@km/_orphan/tt3ki"
aliases:
  - km-tt3ki
created_by: claude:c9beade3
created_at: 2026-03-15T07:30:08Z
closed_at: 2026-03-15T07:35:35Z
close_reason: "Extracted cascade predicates to cascade-predicates.ts. Exhaustive
  tests: 16384 combinations + 10 structural invariants + 16 named scenarios.
  Truth table added to content-phase.ts and RENDERING.md."
---

# [x] Cascade formulas: truth table + exhaustive tests @km/_orphan #task #P3

Extract the 5 critical cascade predicates from renderNodeToBuffer (content-phase.ts) into testable form. Add truth table as comment block. Write exhaustive table-driven tests over all boolean inputs.