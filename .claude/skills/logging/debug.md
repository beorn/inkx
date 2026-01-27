---
description: debug() for internal diagnostics and tracing
---

# debug() - Internal Diagnostics

Use for detailed internal tracing that's only useful when debugging.

## Quick Reference

```typescript
import createDebug from "debug"
const debug = createDebug("km:storage:watch")
debug("config", { watchEnabled, debounceMs })
```

## Namespace Convention

```text
km:<layer>:<subsystem>       # Main packages
inkx:<subsystem>             # inkx renderer
flexx:<subsystem>            # flexx layout engine
```

## Keep Statements Concise

```typescript
debug("resolved", resolved) // Objects
debug("loading %s...", filename) // Inline text
debug("state: %s → %s", oldState, newState) // Transitions
```

## TUI Debugging (Separate from TUI Display)

```bash
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault
# Then: tail -f /tmp/km.log
```

## CLI Flags

```bash
DEBUG=km:* bun km view          # Enable debug() output
LOG_LEVEL=debug bun km view     # Also enables logger debug level
```

**Note:** `debug()` and `logger` are independent. Use `DEBUG=` for debug(), `LOG_LEVEL=` for logger.
