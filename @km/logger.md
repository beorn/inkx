---
mentions:
  - km
id: "@km/logger"
aliases:
  - km-logger
  - "@km/_orphan/logger"
created_at: 2026-02-02T15:23:30Z
closed_at: 2026-05-06T20:38:00Z
close_reason: >-
  Scope absorbed by @km/loggily per scope-consolidation. Open child metrics
  moved → @km/loggily/logger-metrics. logger is the lower-level lib;
  loggily the higher-level interface — kept the family together as one
  scope. Future logging work lives in @km/loggily.
---

# [x] logger-epic @km/logger #epic #P3

Make @beorn/logger the universal JS/TS logging replacement. Unifies logging, spans, and metrics — zero overhead via ?., logger=span with using keyword, ~3KB, everywhere.

## Completed (Phase 0)

- Core logging: levels, namespaces, structured data, child loggers
- Dual output: pretty console (dev) / JSON (production)
- Span timing with using keyword
- Zero-overhead disabled logging via ?.
- Worker thread support
- File writer
- Full km integration
- Tests, docs, migration

## Next

- Phase 1: Universal runtime (browser + edge + Deno)
- Phase 2: Distributed tracing (OTel-compatible)
- Phase 3: Metrics
- Phase 4: Ecosystem & DX

