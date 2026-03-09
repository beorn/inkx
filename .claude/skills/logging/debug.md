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
silvery:<subsystem>          # silvery renderer
flexture:<subsystem>            # flexture layout engine
```

## Keep Statements Concise

```typescript
debug("resolved", resolved) // Objects
debug("loading %s...", filename) // Inline text
debug("state: %s → %s", oldState, newState) // Transitions
```

## TUI Debugging (CRITICAL: Use DEBUG_LOG)

TUI apps occupy the terminal, so debug output must go to a file:

```bash
# Debug km code
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault

# Debug silvery rendering/layout issues
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view /path/to/vault

# Debug everything
DEBUG=km:*,silvery:*,flexture:* DEBUG_LOG=/tmp/debug.log bun km view /path

# In another terminal
tail -f /tmp/debug.log
```

**Common debug patterns:**

| Issue | Namespace |
|-------|-----------|
| Layout problems | `DEBUG=flexture:layout` |
| Keyboard input not working | `DEBUG=silvery:useInput` |
| Render not updating | `DEBUG=silvery:render,silvery:pipeline` |
| Storage/sync issues | `DEBUG=km:storage:*` |
| Board state issues | `DEBUG=km:board:*` |

## CLI Flags

```bash
DEBUG=km:* bun km view          # Enable debug() output
LOG_LEVEL=debug bun km view     # Also enables logger debug level
```

**Note:** `debug()` and `logger` are independent. Use `DEBUG=` for debug(), `LOG_LEVEL=` for logger.
