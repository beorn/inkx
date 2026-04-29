---
id: "@km/logger/tracing"
aliases:
  - km-logger.tracing
  - km-logger-tracing
created_by: claude:fbad9cb1
created_at: 2026-03-04T16:14:54Z
closed_at: 2026-03-04T16:38:21Z
---

# [x] Phase 2: Distributed tracing — W3C traceparent, OTel-compatible export @km/logger #feature #P3 @claude:fbad9cb1

Add distributed tracing capabilities:
- Configurable ID generator (default simple, opt-in W3C 128-bit hex)
- traceparent() utility for HTTP header propagation
- AsyncLocalStorage context propagation (Node only, opt-in)
- OTel-compatible span exporter via addWriter()
- Sampling support (head-based, configurable rate)
- Auto-tag logs with current trace/span ID
This is Phase 2 — depends on universal runtime (Phase 1) being complete.