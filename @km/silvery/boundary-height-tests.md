---
id: "@km/silvery/boundary-height-tests"
aliases:
  - km-silvery.boundary-height-tests
  - km-silvery-boundary-height-tests
created_by: claude:c9beade3
created_at: 2026-03-14T15:21:20Z
closed_at: 2026-03-14T23:45:44Z
close_reason: Implemented and committed in silvery 5b25c8f + termless 3887c47
---

# [x] Add boundary tests for viewport height — rows-1, rows, rows+1, 2*rows @km/silvery #task #P2 @claude:c9beade3

Test height-sensitive rendering at boundary conditions. Include zoom/resize transitions with large vaults that exceed terminal height. The zoom garble bug was never caught because all fixtures used small node trees that fit in test terminals. See docs/lessons/testing-escape-hatches.md.