---
id: "@km/loggily/v2-phase2"
aliases:
  - km-loggily.v2-phase2
  - km-loggily-v2-phase2
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:50Z
closed_at: 2026-04-12T07:49:34Z
close_reason: compose() implemented. LoggerFactory and LoggerPlugin types
  exported. 248 tests pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.v2-phase2
    depends_on_id: km-loggily.api-v2
    type: parent-child
    created_at: 2026-04-11T23:58:50Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-loggily.v2-phase2
    depends_on_id: km-loggily.v2-phase1
    type: blocks
    created_at: 2026-04-11T23:59:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 2: logger decomposition + compose() @km/loggily #task #P2 @Bjørn Stabell

blocks:: [[@km/loggily/api-v2]], [[@km/loggily/v2-phase1]]

Split Logger into baseLogger + plugins (withSpans, withContext, withMetrics). Implement compose(). Default createLogger is pre-composed. Each plugin extends config schema + Logger methods. Tree-shakeable builds.