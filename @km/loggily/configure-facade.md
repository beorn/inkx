---
id: "@km/loggily/configure-facade"
aliases:
  - km-loggily.configure-facade
  - km-loggily-configure-facade
created_by: Bjørn Stabell
created_at: 2026-04-11T23:36:53Z
closed_at: 2026-04-12T00:13:56Z
close_reason: Superseded by km-loggily.api-v2 — configure() was a preset over
  globals; v2 eliminates globals entirely via createLogger options + with*
  plugins
---

# [x] Porcelain API: configure() — unified configuration @km/loggily #feature #P2

blocks:: [[@km/loggily]]

Unified configuration function combining setLogLevel(), setDebugFilter(), setTraceFilter(), setIdFormat(), setSampleRate() into one convenient call. Abstracts away multiple function calls for common setup patterns. See bead notes for design.