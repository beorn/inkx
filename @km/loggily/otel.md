---
id: "@km/loggily/otel"
aliases:
  - km-loggily.otel
  - km-loggily-otel
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:29Z
closed_at: 2026-04-12T18:30:15Z
close_reason: OTEL bridge scaffold implemented at src/otel.ts. toOtel({ api })
  creates a transparent Stage that forwards LogEvent→OTLP LogRecord and
  SpanEvent→OTLP Span. Subpath export at loggily/otel. 4 tests.
  @opentelemetry/api as optional peer dep.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-loggily.otel
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-11T23:58:29Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-loggily.otel
    depends_on_id: km-loggily.v2-phase3
    type: blocks
    created_at: 2026-04-11T23:59:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] OTEL bridge — OpenTelemetry integration @km/loggily #feature #P3

blocks:: [[@km/loggily]], [[@km/loggily/v2-phase3]]

{ otel: { endpoint } } config + loggily/otel subpath module. Exports logs as OTLP log signals, spans as OTLP trace signals. Peer dep @opentelemetry/api. Already planned in why.md ('otel() planned'). Deferred from v1.0 — ship after core pipeline semantics settle.