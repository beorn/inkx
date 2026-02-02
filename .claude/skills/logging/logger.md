---
description: "@beorn/logger for user-facing output and TUI debugging"
---

# @beorn/logger

Structured logging with spans. Logger-first architecture: Span = Logger + Duration.

## Quick Reference

```typescript
import { createLogger } from "@beorn/logger"
const log = createLogger("myapp")

log.info("Loading vault...")
log.warn("Config file not found, using defaults")
log.error("Failed to sync", { error })
```

## Log Levels

| Level  | Purpose                              |
| ------ | ------------------------------------ |
| trace  | Verbose debugging (very high volume) |
| debug  | Debug information (disabled default) |
| info   | Normal operation                     |
| warn   | Recoverable issues                   |
| error  | Failures (always shown)              |

**Log levels:** `silent < error < warn < info < debug < trace`

## Environment Variables

| Variable     | Values                                  | Effect                    |
| ------------ | --------------------------------------- | ------------------------- |
| LOG_LEVEL    | trace, debug, info, warn, error, silent | Filter output by level    |
| TRACE        | 1, true, or namespace prefixes          | Enable span output        |
| TRACE_FORMAT | json                                    | Force JSON output         |
| NODE_ENV     | production                              | Auto-enable JSON format   |

## CLI Flags

```bash
bun km -s sync /tmp/test        # Silent (errors only)
bun km -v view /tmp/test        # Verbose (debug level)
bun km -vv view /tmp/test       # Very verbose (trace level)
bun km --log-level trace view   # Explicit level
LOG_LEVEL=debug bun km view     # Environment variable
```

## Spans (Timing)

Spans measure operation duration. They implement `Disposable` for automatic cleanup:

```typescript
{
  using span = log.span("import", { file: "data.csv" })
  span.info("working...")
  span.spanData.count = 42
}
// → SPAN myapp:import (15ms) {count: 42, file: "data.csv"}
```

Enable spans with `TRACE=1` or `TRACE=namespace`.

## TUI Conditional Logging

For high-frequency code (render loops), use the conditional logger from `apps/km-tui/src/log.ts`:

```typescript
import { log, sid, renderLog, layoutLog, navLog } from "../log"

// Optional chaining skips argument evaluation when disabled
renderLog.debug?.(`TreeNode ${sid(node.id)} children=${children.length}`)
layoutLog.trace?.(`col=${colIndex} card=${cardIndex} y=${y}`)
navLog.debug?.("cursor move", { from, to })

// Child loggers are also conditional
const nodeLog = log.logger(sid(node.id))
nodeLog.debug?.("processing")

// Spans require TRACE env
{
  using span = log.span?.("render")
  span?.debug?.("working...")
}
```

### Why optional chaining (`?.`)?

**Benchmark results** (10M iterations):

| Scenario              | ns/op | Notes                          |
| --------------------- | ----- | ------------------------------ |
| noop (cheap args)     | 0.5   | Fastest for trivial args       |
| `?.` (cheap args)     | 0.7   | ~0.2ns overhead - negligible   |
| noop (expensive args) | 57.6  | Args still evaluated - wasted! |
| `?.` (expensive args) | 2.5   | **22x faster** - args skipped  |

The `?.` pattern skips argument evaluation entirely when disabled.

### Short ID helper

```typescript
sid("abc123def456789")  // → "f456789" (last 8 chars)
```

Use for logging node IDs without cluttering output.

## When to Use Which

| Logger      | Purpose            | When to use                                             |
| ----------- | ------------------ | ------------------------------------------------------- |
| `log`       | TUI debugging      | Component state, render tracking                        |
| `renderLog` | Render tracing     | High-frequency render calls                             |
| `layoutLog` | Layout debugging   | Card positions, column sizes                            |
| `navLog`    | Navigation events  | Cursor movement, selection changes                      |
| Base logger | User-facing output | Progress messages, errors, warnings the user should see |

## Full Documentation

See `vendor/beorn-logger/CLAUDE.md` for complete API reference.
See `vendor/beorn-logger/docs/conditional-logging-research.md` for performance research.
