---
description: "@beorn/logger for user-facing output"
---

# @beorn/logger - User Output

Use for messages the user should see during normal operation.

## Quick Reference

```typescript
import { createLogger } from "@km/core"
const logger = createLogger("@km/storage")

logger.info("Loading vault...")
logger.warn("Config file not found, using defaults")
logger.error("Failed to sync", { error })
```

## When to Use Which

| System    | Purpose            | When to use                                             |
| --------- | ------------------ | ------------------------------------------------------- |
| `debug()` | Internal tracing   | State dumps, performance timing, internal diagnostics   |
| `logger`  | User-facing output | Progress messages, errors, warnings the user should see |

**Specific levels:**

- `debug()` → internal state, performance timing, data flow tracing
- `logger.info()` → progress, success messages, normal operation
- `logger.warn()` → recoverable issues, deprecation notices
- `logger.error()` → failures that affect user (show error to user)

## CLI Flags

```bash
bun km -s sync /tmp/test        # Silent (errors only)
bun km -v view /tmp/test        # Verbose (debug level)
bun km -vv view /tmp/test       # Very verbose (trace level)
bun km --log-level trace view   # Explicit level
LOG_LEVEL=debug bun km view     # Environment variable
```

**Log levels:** `silent < error < warn < info < debug < trace`
