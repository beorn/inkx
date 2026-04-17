---
description: TUI styling rules - colors, selection states, icons
---

# TUI Design System

**Keywords**: TUI styling, colors, selection, cyan, yellow, icons, colorblind, background color, chalk, silvery

When modifying TUI styling (colors, selection states, visual hierarchy), follow these rules. See @docs/ref/visual-spec.md for the full design system.

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

Use Silvery `backgroundColor` OR term.style().bg\*, never both on same element (throws by default):

```tsx
// ✅ CORRECT - silvery style
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

## TUI Framework — Silvery

km migrated off Ink to [silvery](../../../vendor/silvery/). Before writing TUI code, read [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) and [Styling Guide](../../../vendor/silvery/docs/guide/styling.md). Use canonical silvery components (SelectList, TextInput, ModalDialog, etc.) — never reimplement.

Historical Ink-era notes (archived): [docs/archive/ink-patterns-pre-silvery.md](../../../docs/archive/ink-patterns-pre-silvery.md).

## Batch Operations Convention

**Rule: Every card operation is inherently batch-aware. Single card = batch of 1.**

All card operations in `board-actions-edit.ts` and `keyboard-card-ops.ts` follow this structure:

```typescript
export function handleFoo(ctx: ActionCtx): ActionResult {
  // 1. GATHER — Selection.nodes returns multi-selected or cursor card
  const cards = Selection.nodes(ctx)
  if (cards.length === 0) return boundary("foo", "no cards")

  // 2. VALIDATE — all-or-nothing: if ANY card fails, NONE execute
  for (const c of cards) {
    if (!canFoo(c)) return boundary("foo", "can't foo")
  }

  // 3. CONFIRM (optional) — only for destructive/non-trivial ops
  // Set UI state and return; re-enter via separate action (e.g. DELETE_CONFIRM_EXECUTE)

  // 4. EXECUTE — perform mutations
  for (const c of cards) { executeFoo(ctx, c) }

  // 5. CLEANUP — operation-specific (see selection cleanup rules below)
  refreshBoardState(ctx)
  return ok()
}
```

Steps 2 and 3 are optional. Steps 1, 4, 5 are always present.

**Validation is critical for batch**: Indent/outdent validate every card BEFORE executing any. Without this, partial execution creates a mess (some cards indented, some not). Delete aggregates impact across all cards for one confirm dialog.

### Selection Cleanup After Batch

NOT every operation clears the selection. The rule depends on what happened to the cards:

| Situation | Action | Example |
|-----------|--------|---------|
| Cards destroyed | `clearSelection(ctx)` | Delete |
| Cards moved in tree (positions invalid) | `clearSelection(ctx)` | Indent, outdent |
| Cards moved in column (positions shifted) | `rebuildSelection` at new positions | Move up/down, move left/right |
| Cards modified in place | Keep selection | Status toggle |

**Key files**: `Selection` namespace in `selection.ts`, handlers in `board-actions-edit.ts` and `keyboard-card-ops.ts`.

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
- Keep HelpOverlay, ConsoleModal as pure rendering — no input handling

## TUI Testing

For testing TUI appearance, see the [tests skill](../tests/SKILL.md):

- TUI tests (vitest + Silvery virtual buffer) for fast deterministic checks
- GUI/TTY tests (TTY MCP) for pixel-level verification
- DEBUG_LOG for correlating state with visuals
