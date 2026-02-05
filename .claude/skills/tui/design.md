---
description: TUI styling rules - colors, selection states, icons
---

# TUI Design System

**Keywords**: TUI styling, colors, selection, cyan, yellow, icons, colorblind, background color, chalk, inkx

When modifying TUI styling (colors, selection states, visual hierarchy), follow these rules. See @docs/ref/ui.md for the full design system.

## Quick Reference

| Element           | Color/Style                               |
| ----------------- | ----------------------------------------- |
| Selection         | `cyan` bg + `black` fg (NEVER blue/white) |
| Input cursor      | `inverse` (reserved for this only)        |
| Selected header   | `yellow`                                  |
| Unselected header | `yellowBright` + dim                      |
| Status icons      | Color AND shape (colorblind-safe)         |

## Selection States

**CRITICAL:** Selection MUST use `cyan` background + `black` foreground.

```tsx
// ✅ CORRECT
<Text backgroundColor="cyan" color="black">{text}</Text>

// ❌ WRONG - blue/white is not selection
<Text backgroundColor="blue" color="white">{text}</Text>
```

**Reserved colors:**

- `cyan` background = selection only
- `inverse` = input cursor only

## Background Colors

Use inkx `backgroundColor` OR term.style().bg\*, never both on same element (throws by default):

```tsx
// ✅ CORRECT - inkx style
<Text backgroundColor="cyan">{text}</Text>

// ✅ CORRECT - term.style() for ANSI strings
const term = useTerm() // or useTermStatic() outside React
<Text>{term.style().bgCyan.black(text)}</Text>

// ❌ WRONG - mixing throws
<Text backgroundColor="cyan">{term.style().bgCyan(text)}</Text>
```

## Status Icons

Icons MUST use both color AND shape for accessibility:

| Status  | Icon | Color      |
| ------- | ---- | ---------- |
| todo    | ○    | gray       |
| done    | ✓    | green      |
| wip     | ◐    | yellow     |
| blocked | ⊘    | red        |
| dropped | ∅    | gray (dim) |

## Headers

```tsx
// Selected column header
<Text color="yellow">{header}</Text>

// Unselected column header
<Text color="yellowBright" dimColor>{header}</Text>
```

## Ink Framework Patterns

When working on TUI code using Ink, you MUST read @docs/dev/ink-patterns.md. Critical workarounds:

- **Fullscreen race condition** - 50ms delay on init
- **Manual width management** - Constraint propagation required
- **ANSI-aware text length** - Use displayLength() not .length
- **Text truncation** - Use truncateText() for proper ANSI handling

## Input Architecture

**Rule: Command system for discrete keys, `useInputLayer` only for text input.**

| Layer | Purpose | Example |
|-------|---------|---------|
| Command system (`@km/commands`) | ALL discrete key→action mapping | j→cursor_down, h→cursor_left, Esc→close_or_quit |
| Keybinding `when` predicates | Mode-specific behavior | `h` closes detail pane when `isInDetailPane` |
| `useInputLayer("board", ...)` | Base layer in Board.tsx — bridge to command system | Single instance, routes all keys |
| `useLineEdit` (wraps `useInputLayer`) | Raw text input capture | InlineEditField, search input |

**DO NOT:**
- Add `useInputLayer` to components for discrete commands (h/j/k/Esc)
- Scatter keybinding logic across components
- Use `useInputLayer` directly — use `useLineEdit` for text input

**DO:**
- Add keybindings with `when` predicates for mode-specific behavior
- Handle all discrete actions in `board-actions.ts` via the command system
- Keep DetailPane, HelpOverlay, ConsoleModal as pure rendering — no input handling

## TUI Testing

For testing TUI appearance, see [tui.md](../tests/tui.md):

- ttyd + Playwright for headless capture
- Storybook for component isolation
- DEBUG_LOG for correlating state with visuals
