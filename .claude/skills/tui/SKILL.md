---
description: TUI development - design system, km-specific rendering bugs, performance. Use when building silvery components for km, fixing km-tui visual bugs, or optimizing TUI performance. For silvery pipeline bugs (dirty flags, incremental rendering, scroll tiers), use /silvery instead.
argument-hint: [fix|design|perf]
allowed-tools: Task, Read, Glob, Grep, Bash
benefits-from: [recall, tests]
escalate-to: {render: "silvery pipeline bug, not km component issue", arch: "new component pattern or state management design", npm: "silvery package exports or API surface"}
---

# TUI Development

**Keywords**: TUI, silvery, styling, colors, slow, rendering, performance, design system, km-tui, board, card, column

Build and maintain the km TUI. For silvery rendering pipeline issues (incremental rendering, dirty flags, scroll tiers, sticky children), use `/silvery` instead.

## Quick Reference

| Need                        | Load                                          |
| --------------------------- | --------------------------------------------- |
| **User reports a bug**      | [fix.md](fix.md) (see for important TUI info) |
| **Rendering bug** (ghost chars, stale pixels) | [fix.md](fix.md) → "Rendering Bugs" section |
| Colors, icons, styling      | [design.md](design.md)                        |
| **Design a new TUI / redesign** | [design-loop.md](design-loop.md) — LLM mockup → build → QA → iterate |
| **Review visual quality**   | `/design-review` (separate skill)             |
| **Silvery Way code audit**  | `/silverize` (separate skill)                 |
| Slow rendering, memoization | [optimization.md](optimization.md)            |

## Auto-Activation

**Proactively activate** these skills without being asked:

| After doing this... | Suggest... |
|---|---|
| Creating/modifying files in `examples/` | `/silverize` + `/design-review` |
| Modifying view components (`*View.tsx`, `*Column.tsx`, `*Node.tsx`) | `/design-review` on a screenshot |
| Creating a new TUI component or example | `/tui design` (full design loop) |
| Completing substantial visual changes | `/design-review --quick` at minimum |
| User says "looks ugly", "make it look better", "fix the design" | `/tui design` |

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

See [tests/SKILL.md](../tests/SKILL.md) for test commands.

```bash
# FIRST: Run with diagnostic mode (catches incremental render bugs)
SILVERY_STRICT=1 bun vitest run apps/km-tui/tests/
SILVERY_STRICT=1 bun km view /path/to/vault

# Run visual storybook (inline default, j/k to navigate, q to quit)
bun storybook
bun storybook --fullscreen       # alternate screen
bun storybook --fullscreen-nonalt
```

**Full design rationale**: [docs/ref/ui.md](../../docs/ref/ui.md)
