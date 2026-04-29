---
id: "@km/flexily/logger-top-level-await"
aliases:
  - km-flexily.logger-top-level-await
  - km-flexily-logger-top-level-await
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:49Z
closed_at: 2026-03-13T05:38:25Z
close_reason: "Investigated. The top-level await is safe in practice: (1) Bun
  supports top-level await natively. (2) ESM semantics guarantee the await
  resolves before any importing module executes, so there's no race condition.
  (3) The dynamic import of loggily resolves in microseconds (already in
  node_modules) or throws instantly (not installed). (4) The logger is only used
  in 4 source files, always behind optional chaining (log.debug?.()), so it's a
  no-op when disabled. (5) Flexily is only consumed by km (Bun) — no
  browser/older-bundler compat concern. If this ever becomes a standalone
  published package, the logger should be refactored to lazy initialization, but
  that's a publishing concern, not a current one."
owner: bjorn@stabell.org
---

# [x] Quality: logger.ts top-level await complicates sync initialization story @km/flexily #task #P2
