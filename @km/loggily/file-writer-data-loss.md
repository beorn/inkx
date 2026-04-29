---
id: "@km/loggily/file-writer-data-loss"
aliases:
  - km-loggily.file-writer-data-loss
  - km-loggily-file-writer-data-loss
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:39Z
closed_at: 2026-03-14T01:28:33Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: file writer loses buffered logs on write failure @km/loggily #bug #P2

flush() clears buffer BEFORE writeSync() succeeds. If writeSync throws, buffered data is lost. Also close() doesn't protect fd cleanup with try/finally. Fix: only clear buffer after successful write; use try/finally in close(). file-writer.ts:60-64, 89-101. Found by GPT 5.4 Pro review.