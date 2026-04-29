---
id: "@km/logger/metrics"
aliases:
  - km-logger.metrics
  - km-logger-metrics
created_by: claude:fbad9cb1
created_at: 2026-03-04T16:14:56Z
owner: bjorn@stabell.org
---

# [ ] Phase 3: Metrics — counter/gauge/histogram via ?. zero-overhead pattern @km/logger #feature #P4

Future: Unified metrics alongside logs and traces:
- Counter/gauge/histogram via the same ?. zero-overhead pattern
- Export via writer system (Prometheus, StatsD, OTel)
- Same namespace hierarchy
- PII redaction support
- Preset writers: createOtelWriter(), createDatadogWriter()
Phase 3 — depends on Phase 2 (tracing).