# Interactive Exploration

**Philosophy**: Real exploration means using AI intelligence to interactively launch the TUI, look at it, navigate, and notice what feels off. Tests are a safety net, not the main event. Observe, hypothesize, investigate.

## TTY MCP Tools Quick Reference

```
mcp__tty__start({command, cols, rows, cwd})  → {sessionId}   # Launch TUI
mcp__tty__press({sessionId, key})                              # Press a key
mcp__tty__type({sessionId, text})                              # Type text
mcp__tty__text({sessionId})                                    # Get terminal text
mcp__tty__screenshot({sessionId, outputPath})                  # Save screenshot
mcp__tty__wait({sessionId, stable, for, timeout})              # Wait for stability
mcp__tty__stop({sessionId})                                    # Kill session
mcp__tty__list()                                               # List sessions
```

**Key format**: Single chars (`j`, `k`), named keys (`Enter`, `Escape`, `ArrowDown`), modifiers (`Shift+n`, `Control+c`).

## Screenshot Naming

Save to `/tmp/explore-screenshots/` with descriptive names:

```
/tmp/explore-screenshots/01-startup.png
/tmp/explore-screenshots/02-navigation-deep.png
/tmp/explore-screenshots/03-fold-reflow.png
/tmp/explore-screenshots/04-narrow-80x24.png
/tmp/explore-screenshots/05-synthetic-empty-col.png
```

Prefix with sequence number. Name describes the state, not the action.

## What to Look For

**Layout & alignment:**
- Column widths balanced? Cards evenly spaced?
- Borders aligned? No stray characters?
- Cursor indicator visible and at expected position?

**Colors & styling:**
- Selected item clearly highlighted?
- Folded items visually distinct?
- Any raw ANSI codes showing through?

**Blank areas & artifacts:**
- Unexpected blank rows or columns?
- Residual content from previous state?
- Flickering (compare text output before/after same action)

**Async glitches:**
- Content appearing incrementally when it should be instant?
- Stale state after navigation?

**Truncation & overflow:**
- Long titles handled gracefully?
- Wide content pushing layout?
- Does layout degrade at 80x24?

**State consistency:**
- Does pressing `h` always go back?
- After fold/unfold, is cursor still on a valid item?
- After search, does cancel restore previous state?

## Vault Strategy

### Phase 1: Real vault
Use `--path` arg or `/tmp/vt` default. Real vaults catch layout issues with real-world data — varied title lengths, nesting depths, empty sections.

### Phase 2: Synthetic edge cases
Create a purpose-built directory structure:

```bash
mkdir -p /tmp/explore-synthetic/col-empty \
         /tmp/explore-synthetic/col-one \
         /tmp/explore-synthetic/col-deep/a/b/c/d/e

echo "# Single" > /tmp/explore-synthetic/col-one/task.md
echo "# Deep" > /tmp/explore-synthetic/col-deep/a/b/c/d/e/leaf.md

for i in $(seq 1 30); do
  echo "# Task $i" > "/tmp/explore-synthetic/col-one/task-$i.md"
done
```

Edge cases to test: empty columns, single-item columns, deep nesting (5+ levels), many items (scrolling required), mixed depths.

### Phase 3: Narrow terminal
Restart at 80x24 — the minimum practical size. Quick pass through key areas. Does the layout degrade gracefully or break?

## Visual Bug Report Format

When reporting an issue to the reproducer:

```
VISUAL BUG: [clear description of what's wrong]
Terminal size: 120x40
Key sequence from startup: j j l k z l
Expected: Folded item should collapse children
Actual: Children still visible, blank gap appears below
Text output: [relevant section of mcp__tty__text]
Screenshot: /tmp/explore-screenshots/NN-name.png
```

Include **every key pressed** from session start — the reproducer needs this to write a headless test that recreates the exact state.

## Budgets

| Resource | Budget |
|----------|--------|
| Total actions | ~100 across all phases |
| Screenshots | 8-12 (quality over quantity) |
| Terminal sizes | 2+ (120x40 and 80x24 minimum) |
| Phases | 3 (real vault → synthetic → narrow) |

Don't screenshot mechanically after every N actions. Screenshot when something is interesting — startup state, discovered issue, unusual layout, before/after a problematic action.

## Anti-Patterns

- **Don't script blindly**: Think about what you're seeing. If something looks off, investigate — don't just move on.
- **Don't screenshot everything**: 8-12 meaningful screenshots > 50 routine ones.
- **Don't ignore gut feelings**: If a transition "felt weird" but you can't pinpoint why, take a screenshot and note it.
- **Don't skip phases**: Real vault and synthetic test different things. Narrow terminal catches responsive layout bugs.
