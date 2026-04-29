---
id: "@km/markdown/split-roundtrip"
aliases:
  - km-markdown.split-roundtrip
  - km-markdown-split-roundtrip
created_at: 2026-02-04T11:50:53Z
closed_at: 2026-02-04T14:21:11Z
assignee: claude:2a6d91a8
---

# [x] Investigate splitting roundtrip.test.ts (1800 lines) @km/markdown #task #P4 @claude:2a6d91a8

@km/markdown roundtrip.test.ts is the largest test file (1800 lines, 104 tests). Recommend splitting into 5 files by markdown feature: basic, tasks, links, structure, data-model.