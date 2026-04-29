---
id: "@km/mdtest/file-fixtures-wrong-dir"
aliases:
  - km-mdtest.file-fixtures-wrong-dir
  - km-mdtest-file-fixtures-wrong-dir
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:52Z
closed_at: 2026-03-14T01:29:26Z
close_reason: Closed
---

# [x] mdtest: file= fixtures written to stateDir instead of test cwd @km/mdtest #bug #P1

file= blocks are written to plugin's private state dir instead of test working directory. CLI masks this by separately writing to testTempDir. Bun/Vitest integrations only call executor.initialize(), so relative fixture files from markdown are missing. Fix: write file= blocks into active test workspace/cwd. plugins/bash.ts:17-30. Found by GPT 5.4 Pro review.