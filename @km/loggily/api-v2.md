---
mentions:
  - km
  - Bjørn
id: "@km/loggily/api-v2"
aliases:
  - km-loggily.api-v2
  - km-loggily-api-v2
created_by: Bjørn Stabell
created_at: 2026-04-12T00:13:46Z
closed_at: 2026-04-12T18:59:24Z
close_reason: "Quality plateau reached. Architecture: withSpans() decomposed,
  Logger exposes level/dispatch/dispose, PluginCtx for composition. Docs: every
  feature documented, README+CLAUDE.md canonical. Tests: 283 pass (13 new). All
  Pro review findings fixed."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.api-v2
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-11T17:13:46Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-loggily
---

# [x] API v2: composable primitives with ergonomic API @km/loggily #feature #P1 @Bjørn Stabell

blocks:: [[@km/loggily]]

Redesign loggily from global setters to composable with* plugins and ergonomic createLogger options. See vendor/internal/loggily/api-v2-design.md for full design.

