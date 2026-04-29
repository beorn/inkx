---
id: "@km/silvery/test-fuzz-properties"
aliases:
  - km-silvery.test-fuzz-properties
  - km-silvery-test-fuzz-properties
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:14Z
closed_at: 2026-03-13T05:31:48Z
close_reason: "Implemented 4 metamorphic fuzz property invariants (7 tests) in
  vendor/silvery/tests/features/fuzz-properties.fuzz.tsx: (1) resize involution
  - A->B->A matches A, (2) mount permutation invariance - children in different
  order produce same layout, (3) cursor-only mutation no-cell-change - cursor
  moves don't corrupt cell content, (4) replay chunking invariance - same
  actions in different chunk sizes produce same result"
---

# [x] Testing: Add metamorphic fuzz properties — 7 invariants @km/silvery #task #P2

Add property-based fuzz tests: (1) resize involution A→B→A, (2) scroll inverse down n→up n, (3) theme involution A→B→A, (4) mount permutation invariance, (5) cursor-only mutation no-cell-change, (6) capability downgrade determinism, (7) replay chunking invariance.