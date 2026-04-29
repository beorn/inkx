---
id: "@km/silvery/single-pass-cap"
aliases:
  - km-silvery.single-pass-cap
  - km-silvery-single-pass-cap
created_by: claude:c9beade3
created_at: 2026-03-13T04:29:08Z
closed_at: 2026-03-13T05:20:21Z
owner: bjorn@stabell.org
---

# [x] MAX_SINGLE_PASS_ITERATIONS=5, add cap diagnostics to classic path @km/silvery #bug #P3

Works for the known resize case but feedback chains with useContentRect subscribers could need >3 passes. A component chain producing stale→update→subscriber→sibling reflow→sticky stabilize needs 4-5 passes. At minimum add cap-exhaustion logging in dev/strict mode, consider raising to 5. Found by GPT pipeline review (3/3 flagged).