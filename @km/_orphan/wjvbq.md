---
id: "@km/_orphan/wjvbq"
aliases:
  - km-wjvbq
created_by: claude:c9beade3
created_at: 2026-03-15T07:30:08Z
closed_at: 2026-03-15T07:45:52Z
close_reason: "Extracted diffBuffers to diff-buffers.ts. 23 tests: no-changes,
  all-changes, wide→narrow transitions, resize growth/shrink, dirty row
  bounding, row pre-check skip, true-color map diffs, and soundness property
  test (applying diff to prev reconstructs next)."
owner: bjorn@stabell.org
---

# [x] diffBuffers: extract, edge-case + property tests @km/_orphan #task #P3

Extract diffBuffers into diff-buffers.ts. Write edge-case tests (truecolor, wide/narrow transitions, resize, dirty row bounding, row pre-check) and property tests (soundness: applying diff to prev reconstructs next).