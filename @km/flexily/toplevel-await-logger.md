---
mentions:
  - km
id: "@km/flexily/toplevel-await-logger"
aliases:
  - km-flexily.toplevel-await-logger
  - km-flexily-toplevel-await-logger
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:45Z
closed_at: 2026-03-13T05:34:57Z
close_reason: Duplicate of km-flexily.logger-top-level-await (P2)
owner: bjorn@stabell.org
---

# [x] Top-level await in logger.ts forces all importers to be async modules @km/flexily #task #P3

logger.ts uses top-level await (line 60: '_logger = await detectLogger(...)') which makes it an async module. Since layout-zero.ts, node-zero.ts, and index.ts all transitively import logger.ts, the entire flexily package becomes async. This adds import latency and can cause issues with synchronous consumers. The logger also mixes ESM and CJS (require('debug') fallback inside an async import chain). Fix: use synchronous initialization or lazy initialization on first log.debug access. The debug library check could use a sync try-import pattern. Since logging is conditional and typically disabled, the async overhead is pure cost with zero benefit for most consumers. [pro]

