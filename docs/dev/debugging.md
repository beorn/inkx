# Debugging Guide

## Quick Start

```bash
# Enable debug logging
DEBUG=km:* bun km view /path/to/repo

# Log to file (for TUI debugging)
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/repo
tail -f /tmp/km.log  # In another terminal
```

## Debug Namespaces

| Namespace  | Shows                |
| ---------- | -------------------- |
| `km:*`     | All km logging       |
| `km:sync`  | File sync operations |
| `km:store` | Database operations  |
| `km:parse` | Markdown parsing     |

## Visual Debugging

```bash
# Capture TUI state
km screenshot /path/to/output.png
```

## Common Issues

### "Node not found" after edit

1. Check DEBUG_LOG for sync events
2. Verify file was saved (fs_mtime in nodes table)
3. Check for parse errors in markdown

### TUI not updating

1. Check for React render errors
2. Verify event emitter firing (km:events)
3. Check useEffect dependencies

### Sync loop (file keeps changing)

1. Look for actor mismatch in events
2. Check fs_mtime vs actual file mtime
