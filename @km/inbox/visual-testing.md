---
mentions:
  - km
id: "@km/inbox/visual-testing"
aliases:
  - km-visual-testing
  - "@km/_orphan/visual-testing"
created_at: 2026-01-23T17:14:54Z
closed_at: 2026-01-24T01:20:46Z
---

# [x] Review visual testing: make it faster and more robust @km/_orphan #task #P2

## Problem

Visual testing for TUI is currently slow and fragile. Need improvements for both:

1. **Scripted tests** - automated visual regression testing
2. **Interactive probing** - debugging and experimentation

## Current Approaches

### ttyd + Playwright (docs recommend)

- Spawns ttyd server, captures via Playwright
- Slow startup (~5s), flaky timing
- Works headless in CI

### Peekaboo MCP (fallback)

- Requires explicit user approval
- Can capture actual terminal windows
- More reliable but not automated

### DEBUG_LOG + Visual Inspection

- Best for debugging state transitions
- Requires manual correlation of logs to visual output

## Goals

1. **Faster test startup** - reduce 5s+ to <1s if possible
2. **More reliable captures** - eliminate timing-based flakiness
3. **Simpler API** - one-liner for common cases
4. **Better debugging** - easy to capture before/after for bug reports

## Ideas to Explore

### For scripted tests:

- [ ] Pre-warm ttyd server (keep running between tests)
- [ ] Direct terminal buffer capture from inkx (no external process)
- [ ] Snapshot testing with automatic diffing
- [ ] Integration with bun test for visual assertions

### For interactive probing:

- [ ] `km screenshot` CLI command
- [ ] Debug mode that auto-captures on state changes
- [ ] Side-by-side comparison tool
- [ ] Record/replay for reproducing bugs

## Related

- docs/dev/visual-testing.md (current approach)
- .claude/skills/visual-test.md (ttyd instructions)
- .claude/skills/fix-tui.md (debugging workflow)

