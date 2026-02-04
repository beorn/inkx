---
description: "@beorn/logger for user-facing output and TUI debugging"
---

# @beorn/logger

Structured logging with spans. Logger-first architecture: Span = Logger + Duration.

## Quick Reference

```typescript
import { createLogger } from "@beorn/logger"
const log = createLogger("km:storage")

// All methods support ?. for zero-overhead when their level is disabled
log.trace?.(`very verbose: ${expensiveDebug()}`)  // Skipped at default (info)
log.debug?.(`state: ${getState()}`)               // Skipped at default (info)
log.info?.("Loading vault...")                    // Enabled at default
log.warn?.("Config not found, using defaults")    // Enabled at default
log.error?.("Failed to sync", { error })          // Enabled at default

// With -q flag, info is also skipped:
log.info?.("starting")  // Skipped when level=warn
```

## Log Levels

| Level  | Purpose                              |
| ------ | ------------------------------------ |
| trace  | Verbose debugging (very high volume) |
| debug  | Debug information (disabled default) |
| info   | Normal operation                     |
| warn   | Recoverable issues                   |
| error  | Failures (always shown)              |

**Log levels (most → least verbose):** `trace > debug > info > warn > error > silent`

## Environment Variables

| Variable     | Values                                  | Effect                    |
| ------------ | --------------------------------------- | ------------------------- |
| LOG_LEVEL    | trace, debug, info, warn, error, silent | Filter output by level    |
| TRACE        | 1, true, or namespace prefixes          | Enable span output        |
| TRACE_FORMAT | json                                    | Force JSON output         |
| NODE_ENV     | production                              | Auto-enable JSON format   |

## CLI Flags

```bash
bun km view /tmp/test           # Default (info level)
bun km -v view /tmp/test        # Verbose (debug level)
bun km -vv view /tmp/test       # Very verbose (trace level)
bun km -q view /tmp/test        # Quiet (warn level only)
bun km -qq view /tmp/test       # Quieter (error level only)
bun km -qqq view /tmp/test      # Silent (no output)
bun km -v -q view /tmp/test     # Offset: cancels out to info
bun km -s sync /tmp/test        # Silent (shortcut for -qqq)
bun km --log-level trace view   # Explicit level (overrides -v/-q)
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

## Zero-Overhead Logging Pattern

`createLogger` returns `undefined` for disabled levels. Use `?.` on debug/trace calls to skip argument evaluation entirely:

```typescript
import { createLogger } from "@beorn/logger"
const log = createLogger("km:storage")

// Info/warn/error: always enabled at default level - no ?. needed
log.info("Starting sync...")
log.warn("Deprecated config option")
log.error("Failed to write file", { error })

// Debug/trace: use ?. to skip expensive arg evaluation when disabled
log.debug?.(`state: ${JSON.stringify(state)}`)
log.trace?.(`node ${node.id.slice(-8)} children=${children.length}`)

// Child loggers inherit the conditional behavior
const child = log.logger("import")
child.debug?.("processing")

// Spans work normally
{
  using span = log.span("import")
  span.info("working...")
}
```

### TUI-Specific Loggers

For high-frequency code (render loops), use the loggers from `apps/km-tui/src/log.ts`:

```typescript
import { log, sid, renderLog, layoutLog, navLog } from "../log"

// Optional chaining skips argument evaluation when disabled
renderLog.debug?.(`TreeNode ${sid(node.id)} children=${children.length}`)
layoutLog.trace?.(`col=${colIndex} card=${cardIndex} y=${y}`)
navLog.debug?.("cursor move", { from, to })
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
