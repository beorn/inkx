---
mentions:
  - km
id: "@km/loggily/otel-compat"
aliases:
  - km-loggily.otel-compat
  - km-loggily-otel-compat
created_by: Bjørn Stabell
created_at: 2026-04-11T22:57:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-loggily.otel-compat
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-11T15:58:29Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-loggily
---

# [ ] OpenTelemetry compatibility layer @km/loggily #feature #P4

blocks:: [[@km/loggily]]

Bridge loggily to OpenTelemetry via loggily/otel subpath export. One-call setup for most users, full primitives available underneath.

## API Design

### Tier 1: One-call setup (most users)

\`\`\`typescript
import { otel } from "loggily/otel"

// Zero-config: reads OTEL_EXPORTER_OTLP_ENDPOINT from env
otel()

// Or with minimal config
otel({ endpoint: "https://collector:4318", serviceName: "myapp" })
\`\`\`

Auto-creates TracerProvider + LoggerProvider with OTLP exporter, batch processor, sensible defaults. Switches to W3C IDs. All loggily spans and logs flow to the OTel backend. Returns a cleanup function.

### Tier 2: Bring your own provider

\`\`\`typescript
import { bridge } from "loggily/otel"

bridge({
  tracerProvider: myProvider,
  loggerProvider: myLogProvider, // optional
})
\`\`\`

For teams with existing OTel infrastructure.

### Tier 3: Primitives

\`\`\`typescript
import {
  createSpanWriter,
  createLogWriter,
  withTraceparent
} from "loggily/otel"

// Manual writer registration
const writer = createSpanWriter({ tracerProvider })
addWriter(writer)

// Incoming distributed trace context
withTraceparent(req.headers.traceparent, async () => {
  // all loggily spans in this async context inherit the trace
  await handleRequest(req)
})
\`\`\`

## What otel() does under the hood

1. Creates TracerProvider with BatchSpanProcessor + OTLPTraceExporter
2. Creates LoggerProvider with BatchLogRecordProcessor + OTLPLogRecordExporter
3. Calls setIdFormat("w3c") for OTel-compatible trace/span IDs
4. Registers span writer (loggily spans -> OTel spans)
5. Registers log writer (loggily logs -> OTel log records)
6. Enables ALS context propagation if not already enabled
7. Maps loggily levels to OTel severity: trace=1, debug=5, info=9, warn=13, error=17
8. Reads standard OTel env vars: OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL, OTEL_RESOURCE_ATTRIBUTES
9. Returns { shutdown() } for graceful cleanup

## Package structure

- Subpath export: loggily/otel (same package)
- Peer deps: @opentelemetry/api
- Optional deps: @opentelemetry/sdk-trace-node, @opentelemetry/sdk-logs, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/exporter-logs-otlp-http
- otel() requires the optional deps; bridge() only needs @opentelemetry/api

## Design principles

- Loggily API unchanged -- OTel is an export layer, not an API replacement
- otel() is opinionated: OTLP, batch processing, env var config. That's the point.
- bridge() is unopinionated: you bring your own providers
- Forward-facing: ship spans AND logs export from day one (OTel Logs API is the intended bridge pattern per spec)
- Follows OTel env var conventions so ops teams get what they expect

## Non-goals

- Auto-instrumentation of HTTP/DB/etc (use OTel instrumentation packages for that)
- OTel metrics (loggily is logging + spans)
- Replacing OTel SDK for complex distributed tracing setups

