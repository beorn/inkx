---
id: "@km/inbox/o9owc"
aliases:
  - km-o9owc
  - "@km/_orphan/o9owc"
created_by: claude:e719173f
created_at: 2026-03-04T12:57:20Z
closed_at: 2026-03-04T13:07:30Z
owner: bjorn@stabell.org
---

# [x] Vision: @beorn/logger as universal logging replacement @km/_orphan #feature #P2

Evaluate the opportunity for @beorn/logger to replace the entire JS/TS logging ecosystem (debug, pino, winston, bunyan, loglevel, consola, roarr) plus basic tracing (OpenTelemetry lite).

## Key Questions
1. How can it credibly replace ALL of them? What's the unifying thesis?
2. What are the actual gaps for browser support? (Answer: small — just process.env/stderr guards)
3. What are the actual gaps for distributed tracing? (Answer: medium — ID format, W3C traceparent, AsyncLocalStorage, exporters)
4. What's the competitive positioning? (zero-overhead via ?., logger=span, using keyword, ~3KB)
5. What's the roadmap priority order?

## Research Done
- Browser gaps: Only 4 Node-specific patterns (process.env, process.stderr, fs, process.on exit). Worker support already universal. picocolors already universal. No breaking changes needed.
- Distributed tracing gaps: Missing W3C 128-bit hex IDs, traceparent header injection, AsyncLocalStorage context propagation, OTel exporters, sampling. But span data model is solid foundation.
- Unique differentiators no competitor has: zero-overhead disabled logging via ?. (22x faster), logger=span unification, using keyword, ~3KB bundle.

## Focus Areas to Evaluate
- Universal runtime (browser + node + edge + Deno + Bun)
- Distributed tracing (OTel-compatible span export)
- Transport/sink ecosystem (or deliberate simplicity)
- Developer experience (the 'humane' output angle)
- Performance story (benchmarks vs pino, winston, etc.)
- Migration paths from each competitor