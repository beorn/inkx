---
id: "@km/flexily/classic-zero-drift"
aliases:
  - km-flexily.classic-zero-drift
  - km-flexily-classic-zero-drift
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:48Z
closed_at: 2026-03-13T05:38:57Z
close_reason: "Investigated. No classic-vs-zero differential tests exist. The
  classic algorithm (src/classic/) is a debugging reference implementation
  (~2900 LOC). Building a differential test suite requires: (1) importing both
  Node classes and mapping between their APIs, (2) generating random trees and
  applying identical styles to both, (3) comparing layout results. This is
  substantial work (~100+ LOC test infrastructure). However, correctness is
  already well-covered: the relayout-consistency fuzz tests (1200+ tests) verify
  incremental vs fresh layout, and the yoga-comparison tests (38 tests) verify
  against Yoga WASM. These provide strong correctness guarantees for the zero
  algorithm. The classic algorithm is rarely used (no km/silvery consumer
  imports it). Classic-vs-zero drift is a theoretical concern, not a practical
  one. Deferring as tracked-for-later — would be valuable if classic ever
  becomes actively used or if caching bugs resurface."
owner: bjorn@stabell.org
---

# [x] Testing: Need classic-vs-zero differential test suite to prevent drift @km/flexily #task #P2
