---
mentions:
  - km
---

# [x] Phase 1: White-box APIs on TestApp (click, expectNodeBorder/Color, expectNoGhostChars) @km/all #task #P0

Add missing APIs that the FREEZE bucket needs:

- click(x, y): mouse events (4 files blocked)
- expectNodeBorder(nodeId, style): border style assertion (8 files blocked)
- expectNodeColor(nodeId, color): text color assertion (8 files blocked)
- expectNoGhostChars(): visual integrity check (3 files blocked)
- screen.ansi: raw ANSI access for termless tests (2 files blocked)

Delete: nothing (additive phase)
New tests: matchers.test.ts updated with new API tests
/complete: all 5 APIs exist on TestApp interface and work on headless backend

