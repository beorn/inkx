---
id: "@km/loggily/v2-phase3"
aliases:
  - km-loggily.v2-phase3
  - km-loggily-v2-phase3
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:52Z
closed_at: 2026-04-12T07:46:48Z
close_reason: All 6227 km tests + 248 loggily tests pass. Legacy setters map to
  env vars. Phase 2 (compose) not blocking.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.v2-phase3
    depends_on_id: km-loggily.api-v2
    type: parent-child
    created_at: 2026-04-11T23:58:52Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-loggily.v2-phase3
    depends_on_id: km-loggily.v2-phase2
    type: blocks
    created_at: 2026-04-11T23:59:03Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 3: deprecate v1 globals + migrate km @km/loggily #task #P2 @Bjørn Stabell

blocks:: [[@km/loggily/api-v2]], [[@km/loggily/v2-phase2]]

Deprecate setLogLevel, setDebugFilter, enableSpans, addWriter, etc. Migrate ~10 km files that use globals to v2 config. Update @km/_orphan/core re-exports. Write migration guide. Keep v1 API working with deprecation warnings for one minor version.