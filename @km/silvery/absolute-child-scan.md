---
mentions:
  - km
id: "@km/silvery/absolute-child-scan"
aliases:
  - km-silvery.absolute-child-scan
  - km-silvery-absolute-child-scan
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:41Z
closed_at: 2026-03-13T04:57:57Z
close_reason: "False positive: direct-children-only scan is correct by design.
  Nested changes inside absolute children affect only that child's subtree, not
  the parent's content area."
owner: bjorn@stabell.org
---

# [x] absoluteChildMutated only scans direct absolute children, misses nested @km/silvery #bug #P3

Stale overlay cleanup relies on scanning direct children for position=absolute. If absolute overlay is wrapped in a normal-flow wrapper, stale overlay pixels can survive. Either recursively detect or document the limitation. Found by GPT pipeline review.

