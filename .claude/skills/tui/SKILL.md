---
description: TUI development - design system, debugging, performance. Use when building Ink components, fixing rendering bugs, or optimizing TUI performance.
argument-hint: [fix|design|perf]
allowed-tools: Task, Read, Glob, Grep, Bash
---

# TUI Development

**Keywords**: TUI, Ink, styling, colors, slow, rendering, performance, design system

Build and maintain the Ink-based TUI.

## Quick Reference

| Need                        | Load                                          |
| --------------------------- | --------------------------------------------- |
| **User reports a bug**      | [fix.md](fix.md) (see for important TUI info) |
| **Rendering bug** (ghost chars, stale pixels) | [fix.md](fix.md) → "Rendering Bugs" section |
| Colors, icons, styling      | [design.md](design.md)                        |
| Slow rendering, memoization | [optimization.md](optimization.md)            |

## Critical Design Rules

- Selection: `cyan` bg + `black` fg (NEVER blue)
- `inverse` reserved for input cursor only
- Icons: color AND shape (colorblind-safe)
- No emojis in status indicators

## Ink Gotchas

1. **Fullscreen race**: Add 50ms delay after clear
2. **Width calculation**: Manual for ANSI, use `stringWidth()`
3. **Text truncation**: Must be ANSI-aware

## Common Debug Commands

```bash
# FIRST: Run with diagnostic mode (catches incremental render bugs)
INKX_STRICT=1 bun vitest run apps/km-tui/tests/
INKX_STRICT=1 bun km view /path/to/vault

# Run visual storybook (inline default, j/k to navigate, q to quit)
bun storybook
bun storybook --fullscreen       # alternate screen
bun storybook --fullscreen-nonalt

# Run TUI tests
bun run test:mock
```

**Full design rationale**: [docs/ref/ui.md](../../docs/ref/ui.md)
