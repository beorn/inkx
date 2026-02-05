# Debugging Incremental Rendering Bugs

**Keywords**: inkx, rendering, incremental, stale pixels, fast-path, dirty flags, INKX_STRICT

> **Full documentation**: [docs/lessons/incremental-rendering.md](/docs/lessons/incremental-rendering.md)

## Quick Reference

When you see blank regions or stale backgrounds after navigation:

1. **Check if INKX_STRICT is catching it** - Tests have it on by default
2. **Read the error output** - Look for "ALL DIRTY FLAGS FALSE" in fast-path analysis
3. **Common cause**: Parent cleared its region but children skipped by fast-path
4. **Fix pattern**: Include `parentRegionCleared` or `needsViewportClear` in `childHasPrev` calculation

See the full documentation for debugging workflow, dirty flag reference, and testing checklist.
