---
id: "@km/mdtest/state-dir-leaked"
aliases:
  - km-mdtest.state-dir-leaked
  - km-mdtest-state-dir-leaked
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:58Z
closed_at: 2026-03-14T01:29:26Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: temporary state directory leaked on each run @km/mdtest #bug #P2

Plugin creates per-file stateDir with mkdtempSync() but never removes it. CLI/integrations clean test temp dirs but not plugin's private dir. Repeated runs accumulate temp files. Fix: add cleanup in afterAll() or disposal hook. plugins/bash.ts:17-25,92-121. Found by GPT 5.4 Pro review.