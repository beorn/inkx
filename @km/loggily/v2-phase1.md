---
id: "@km/loggily/v2-phase1"
aliases:
  - km-loggily.v2-phase1
  - km-loggily-v2-phase1
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:48Z
closed_at: 2026-04-12T07:41:07Z
close_reason: "Phase 1 complete: pipeline.ts, core.ts rewritten, 248 tests pass,
  typecheck clean"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.v2-phase1
    depends_on_id: km-loggily.api-v2
    type: parent-child
    created_at: 2026-04-11T23:58:48Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 1: core pipeline + createLogger polymorphic @km/loggily #task #P1 @Bjørn Stabell

blocks:: [[@km/loggily/api-v2]]

Implement the core v2 architecture: array-based config, object/value discrimination, Stage type (event => event|null), LogEvent/SpanEvent types, fromConfig compiler, pipe() internal, createLogger(name, array?). No breaking changes yet — add new API alongside v1 globals.