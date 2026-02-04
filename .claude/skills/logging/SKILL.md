---
description: Logging patterns - debug(), logger, worker threads. Use when adding debug output or configuring loggers.
argument-hint: [debug|logger|worker]
allowed-tools: Read, Glob, Grep, Task
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

// User-facing messages - use logger (returns undefined for disabled levels)
import { createLogger } from "@beorn/logger"
const log = createLogger("km:storage")
log.info("Syncing vault...")                        // Always enabled at default level
log.debug?.(`state: ${JSON.stringify(state)}`)      // Use ?. for debug/trace
log.error("Failed to write file", { path, error })
```

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
DEBUG=km:* bun km view          # debug() still works independently
```

**Log levels:** `trace < debug < info < warn < error < silent`

## Sub-Skills

| File                                   | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| [debug.md](debug.md)                   | debug() namespaces, TUI debugging       |
| [logger.md](logger.md)                 | @beorn/logger levels, when to use which |
| [worker-threads.md](worker-threads.md) | Worker thread debug forwarding pattern  |
