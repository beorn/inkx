---
mentions:
  - km
id: "@km/mdtest/hook-cleanup-no-finally"
aliases:
  - km-mdtest.hook-cleanup-no-finally
  - km-mdtest-hook-cleanup-no-finally
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:57Z
closed_at: 2026-03-14T01:34:31Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: CLI hook cleanup not protected by finally @km/mdtest #bug #P2

afterEach() only reached on normal path, afterAll() only after loop completes. If beforeEach/executeBlock/matching throws, cleanup hooks are skipped. Fix: wrap each block in try/finally for afterEach, wrap file execution in try/finally for afterAll. index.ts:287-427. Found by GPT 5.4 Pro review.

