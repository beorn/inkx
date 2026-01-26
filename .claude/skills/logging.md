---
description: Logging patterns - debug(), logger, worker threads
---

# Logging Patterns

**Keywords**: logging, debug, logger, worker thread, console output, DEBUG_LOG, log levels

km has two logging systems for different purposes:

| System    | Purpose            | When to use                                             |
| --------- | ------------------ | ------------------------------------------------------- |
| `debug()` | Internal tracing   | State dumps, performance timing, internal diagnostics   |
| `logger`  | User-facing output | Progress messages, errors, warnings the user should see |

## Quick Reference

```typescript
// Internal diagnostics - use debug()
import createDebug from "debug"
const debug = createDebug("km:storage:watch")
debug("config", { watchEnabled, debounceMs })

// User-facing messages - use logger
import { createLogger } from "@km/core"
const logger = createLogger("@km/storage")
logger.info("Syncing vault...")
logger.error("Failed to write file", { path, error })
```

## CLI Flags

```bash
bun km -s sync /tmp/test        # Silent (errors only)
bun km -v view /tmp/test        # Verbose (debug level)
bun km -vv view /tmp/test       # Very verbose (trace level)
bun km --log-level trace view   # Explicit level
LOG_LEVEL=debug bun km view     # Environment variable
DEBUG=km:* bun km view          # debug() still works independently
```

**Log levels:** `silent < error < warn < info < debug < trace`

## debug() - Internal Diagnostics

Use for detailed internal tracing that's only useful when debugging.

**Namespace convention:**

```
km:<layer>:<subsystem>       # Main packages
inkx:<subsystem>             # inkx renderer
flexx:<subsystem>            # flexx layout engine
```

**Keep statements concise:**

```typescript
debug("resolved", resolved) // Objects
debug("loading %s...", filename) // Inline text
debug("state: %s → %s", oldState, newState) // Transitions
```

**TUI debugging (separate from TUI display):**

```bash
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault
# Then: tail -f /tmp/km.log
```

## @beorn/logger - User Output

Use for messages the user should see during normal operation.

```typescript
import { createLogger } from "@km/core"
const logger = createLogger("@km/storage")

logger.info("Loading vault...")
logger.warn("Config file not found, using defaults")
logger.error("Failed to sync", { error })
```

**When to use which:**

- `debug()` → internal state, performance timing, data flow tracing
- `logger.info()` → progress, success messages, normal operation
- `logger.warn()` → recoverable issues, deprecation notices
- `logger.error()` → failures that affect user (show error to user)

## Worker Thread Debug Output (MANDATORY)

**CRITICAL: Never delete `process.env.DEBUG` or suppress `console.*` or `debug()` calls.**

Suppressing output hides bugs. Worker threads MUST forward all debug output to the main thread.

**Why worker threads need special handling:**

- Worker threads can't share file descriptors with main thread
- `DEBUG_LOG` redirection only works in main thread
- Calling `createDebug()` in worker goes to stderr, bypassing `DEBUG_LOG`
- This causes debug output to appear in TUI and interfere with rendering

**MANDATORY Pattern for ALL Worker Threads:**

```typescript
// Worker thread (e.g., worker-thread.ts)
const NAMESPACE = "km:storage:watch:worker"

// Custom debug function that forwards to main thread
function debug(message: string, ...args: unknown[]): void {
  // Format the message with args (simple %s/%d/%O replacement)
  let formatted = message
  let argIndex = 0
  formatted = message.replace(/%[sdOo]/g, () => {
    const arg = args[argIndex++]
    if (arg === undefined) return ""
    if (arg === null) return "null"
    if (typeof arg === "object") return JSON.stringify(arg)
    return String(arg)
  })

  // Send to main thread - NEVER call createDebug() in worker
  postMessage({ type: "debug", namespace: NAMESPACE, message: formatted })
}

// Use this debug() throughout worker
debug("worker started, watching %s", vaultPath)
```

```typescript
// Main thread bridge (e.g., worker-bridge.ts)
import createDebug from "debug";
const workerDebug = createDebug("km:storage:watch:worker");

// In message handler:
case "debug":
  // Forward worker debug through main thread's debug logger
  // This ensures DEBUG_LOG captures worker output
  workerDebug("%s", message.message);
  break;
```

**Message type definition:**

```typescript
export type WorkerMessage =
  | { type: "debug"; namespace: string; message: string }
  | /* ... other message types */;
```

**DO:**

- Forward ALL debug output to main thread via `postMessage()`
- Use custom `debug()` function in worker that only sends messages
- Format messages in worker, log in main thread

**NEVER:**

- Call `createDebug()` directly in worker threads
- Delete or suppress `process.env.DEBUG`
- Use `console.log/error/warn` in workers (same issue as `debug()`)
- Assume "this worker doesn't need debugging" - bugs happen everywhere

**Reference implementation:** [packages/km-storage/src/watch/worker-thread.ts](packages/km-storage/src/watch/worker-thread.ts)
