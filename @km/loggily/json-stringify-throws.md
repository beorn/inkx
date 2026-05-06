---
mentions:
  - km
id: "@km/loggily/json-stringify-throws"
aliases:
  - km-loggily.json-stringify-throws
  - km-loggily-json-stringify-throws
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:17Z
closed_at: 2026-03-14T01:28:10Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] loggily: formatting throws on circular data/bigint @km/loggily #bug #P2

formatConsole() uses raw JSON.stringify(data) which throws on circular structures and bigint. formatJSON() handles circular but not bigint. A logging call can raise synchronously. Fix: shared safe serializer for both modes (bigint→string, symbol/function stringify, Error serialize, circular→[Circular]). core.ts:375-425. Found by GPT 5.4 Pro review.

