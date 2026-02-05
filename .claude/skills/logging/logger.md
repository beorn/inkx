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
log.trace?.(`very verbose: ${expensiveDebug()}`)  // Skipped at default (warn)
log.debug?.(`state: ${getState()}`)               // Skipped at default (warn)
log.info?.("Loading vault...")                    // Skipped at default (warn)
log.warn?.("Config not found, using defaults")    // Enabled at default
log.error?.("Failed to sync", { error })          // Enabled at default

// With -v flag, info is enabled:
log.info?.("starting")  // Enabled when level=info (-v)
```

## Log Levels

| Level  | Purpose                                       |
| ------ | --------------------------------------------- |
| trace  | Verbose debugging (very high volume)          |
| debug  | Debug information                             |
| info   | Normal operation                              |
| warn   | Recoverable issues (**default CLI level**)    |
| error  | Failures (always shown)                       |

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
bun km view /tmp/test           # Default (warn level)
bun km -v view /tmp/test        # Verbose (info level)
bun km -vv view /tmp/test       # More verbose (debug level)
bun km -vvv view /tmp/test      # Very verbose (trace level)
bun km -q view /tmp/test        # Quiet (error level only)
bun km -qq view /tmp/test       # Quieter (silent)
bun km -v -q view /tmp/test     # Offset: cancels out to warn
bun km -s sync /tmp/test        # Silent (shortcut for -qq)
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

// Warn/error: always enabled at default level
log.warn?.("Deprecated config option")
log.error?.("Failed to write file", { error })

// Info/debug/trace: use ?. to skip when disabled (info skipped at default warn level)
log.info?.("Starting sync...")
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

## When to Use Each Level

| Level | Use For | Examples | Visible By Default? |
|-------|---------|----------|---------------------|
| **error** | Operation failed, cannot complete user request | "Failed to write file", "Database connection lost" | Yes |
| **warn** | Succeeded but degraded, or will fail soon | "Config not found, using defaults", "Disk 90% full" | Yes |
| **info** | Significant business events, milestones | "Syncing vault...", "Loaded 500 nodes in 1.2s" | No (-v) |
| **debug** | Developer diagnostic information | "cache hit", "skipping unchanged file" | No (-vv) |
| **trace** | Very fine-grained, high-volume | "layout node X at y=50", "diffing cell (3,5)" | No (-vvv) |

### Key Distinction: error vs warn

| error | warn |
|-------|------|
| User's requested operation **failed** | Operation **succeeded** but with caveats |
| "Could not save file" | "Saved file but without metadata (permission denied)" |
| Something is **broken** | Something is **concerning** |
| Requires user action to fix | User should be aware, may need action later |

### Decision Flowchart

```
Is this a programming error or data integrity risk?
├─ Yes → THROW with clear message (what, why, how to fix)
└─ No → Is the operation failing?
         ├─ Yes → Is it recoverable?
         │        ├─ No → error (operation cannot continue)
         │        └─ Yes → warn (operation continues but degraded)
         └─ No → Is it something the user initiated or should see?
                  ├─ Yes → info (user-facing progress)
                  └─ No → Is it useful for debugging issues?
                           ├─ Yes, occasionally → debug
                           └─ Yes, high-frequency → trace
```

### Anti-Patterns

| Don't | Do |
|-------|-----|
| `log.debug?.("error: ...")` | `log.error?.("...")` — errors should be errors |
| `log.warn?.("Starting...")` | `log.info?.("Starting...")` — not a warning |
| `log.error?.("Config missing, using defaults")` | `log.warn?.(...)` — it recovered |
| `catch (e) { /* ignore */ }` | Throw if programming error, log if expected |
| `catch (e) { log.debug?.(e) }` | Use appropriate level — debug is invisible by default |
| `log.warn?.("Duplicate node")` | Include name, type, path so user can find it |
| `log.warn?.(\`error: ${nodeId}\`)` | Use human-readable name, not raw ID |
| Log data corruption risk | **Throw** — don't let user continue with bad data |

---

## When to Use Which Logger

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
