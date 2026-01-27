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

## Sub-Skills

| File                                   | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| [debug.md](debug.md)                   | debug() namespaces, TUI debugging       |
| [logger.md](logger.md)                 | @beorn/logger levels, when to use which |
| [worker-threads.md](worker-threads.md) | Worker thread debug forwarding pattern  |
