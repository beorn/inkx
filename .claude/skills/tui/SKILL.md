---
description: TUI development - design system, debugging, performance
argument-hint: [fix|design|perf]
allowed-tools: Task, Read, Glob, Grep, Bash
---

# TUI Development

**Keywords**: TUI, Ink, styling, colors, slow, visual, rendering, performance

Build and maintain the Ink-based TUI.

## Quick Reference

| Need                        | Load                               |
| --------------------------- | ---------------------------------- |
| Colors, icons, styling      | [design.md](design.md)             |
| Visual bugs, debugging      | [fix.md](fix.md)                   |
| Slow rendering, memoization | [optimization.md](optimization.md) |

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
# Run visual storybook
bun storyboard

# Run inkx visual tests
bun run test:mock

# Check for act() warnings
bun run test:fast 2>&1 | grep -i "act()"
```

**Full design rationale**: [docs/ref/ui.md](../../docs/ref/ui.md)
