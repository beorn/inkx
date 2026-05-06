---
mentions:
  - km
  - Bjørn
id: "@km/loggily/no-globals"
aliases:
  - km-loggily.no-globals
  - km-loggily-no-globals
created_by: Bjørn Stabell
created_at: 2026-04-13T00:17:49Z
closed_at: 2026-04-13T00:24:03Z
close_reason: Removed ambient metrics (side-effect import), added
  TRACE_ID_FORMAT + TRACE_SAMPLE_RATE env vars, idFormat/sampleRate config keys,
  deprecated setIdFormat/setSampleRate setters. 307 tests pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.no-globals
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-12T17:18:11Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-loggily
---

# [x] Remove global setters — setIdFormat/setSampleRate into config/env @km/loggily #task #P0 @Bjørn Stabell

blocks:: [[@km/loggily]]

setIdFormat() and setSampleRate() in tracing.ts are global mutable state, violating principles.md. Move to env vars (TRACE_ID_FORMAT=w3c, TRACE_SAMPLE_RATE=0.1) read by withEnvDefaults(), or config object keys ({ idFormat, sampleRate }). State hierarchy: env vars → createLogger + config → logger (immutable).

