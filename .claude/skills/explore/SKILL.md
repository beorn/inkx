---
description: TUI exploration - targeted scenario testing + randomized bug hunting. Use when exercising km view to find bugs, test scenarios, or inspect the live terminal.
argument-hint: [scenario | --gui | --peekaboo | --path <vault> | km view <path>]
---

# TUI Exploration Testing

**Keywords**: explore, fuzz, random, bug hunting, TUI test, visual test, repro, peekaboo, ghostty

## Decision Tree — Pick ONE, Act Immediately

**Parse the arguments first, then run the right command:**

| User says | Action | Command |
|-----------|--------|---------|
| `/explore km view <path>` or `/explore --path <path>` | Test real vault with diagnostics | `TEST_VAULT=<path> bun vitest run apps/km-tui/tests/real-vault.test.ts` |
| `/explore` (no args) | Run fuzz suite | `bun test:fuzz` |
| `/explore --gui` or `/explore --gui <path>` | Visual TTY mode | See [TTY section](#gui-mode) below |
| `/explore --peekaboo ...` | Live Ghostty inspection | See [peekaboo.md](peekaboo.md) |
| `/explore <scenario description>` | Targeted bug repro | Write a test first — see [targeted.md](targeted.md) |

**Do NOT**: read fuzz test source files, try deprecated scripts, or guess vitest CLI flags. The commands above work as-is.

## Examples

```
/explore km view /tmp/vt            # Real vault diagnostics (TEST_VAULT)
/explore --path /tmp/tst-vault      # Same thing
/explore                            # Fuzz suite (bun test:fuzz)
/explore --gui                      # Visual mode with screenshots
/explore --peekaboo                 # Inspect your live Ghostty terminal

# Targeted exploration (describe the scenario)
/explore going down after "Justice" node causes cursor to jump
/explore switching from cards to list view loses cursor position
/explore zoom into Projects folder then press j

# Live investigation with Peekaboo
/explore --peekaboo check why the cursor is misaligned
```

## Commands

```bash
# Real vault diagnostics (incremental render checks, fold/unfold, random nav)
TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts

# Fuzz suite (navigation, view modes, dialogs, selection, fold, etc.)
bun test:fuzz                                    # All fuzz tests
bun test:fuzz apps/km-tui/tests/navigation-fuzz  # Specific fuzz file
FUZZ_SEED=12345 bun test:fuzz                    # Reproducible run
```

**What the real vault tests verify** (with `withDiagnostics` wrapper):
- Incremental render matches fresh render after each action
- Level navigation (k k j j) with cursor invariants
- Fold/unfold stability
- Outline depth changes (< >) don't cause blank cards
- Random 30-action sequences with mixed navigation

**What the fuzz tests verify** (with invariant library):
- No `[object Object]`, `TypeError:`, `NaN` in rendered output
- Valid cursor at all times (level, col, card indices)
- Valid view mode, mutually exclusive dialogs
- Non-negative scroll offset, state consistency
- No total screen replacement (render failure detection)

**When bugs are found:**
1. Fuzz tests auto-shrink to minimal failing sequence
2. Create bead: `bd create "TUI: [description]" --type=bug`
3. Copy minimal sequence to a deterministic test in `apps/km-tui/tests/`
4. Reference bead in test comment (e.g., "See bead km-xyz")

## Modes

| Mode | Speed | Use Case |
|------|-------|----------|
| **Headless (default, PREFERRED)** | Fast (~1000/s) | `bun test:fuzz`, `TEST_VAULT=...`, DOM-level checks |
| **GUI (`--gui`)** | Slower (~1/s) | Pixel verification, visual bugs |
| **Peekaboo (`--peekaboo`)** | Interactive | Inspect live Ghostty terminal |
| **Targeted** | Varies | User-described scenario first, then expand |

**IMPORTANT: Always prefer headless mode** (`testEnv()`/`board.press()`/`board.screenshot()`) over GUI/TTY mode. Headless tests are faster, more reliable, and catch character-level issues. Only use `--gui` (TTY/Playwright) when pixel-level visual verification is explicitly needed. **If you must use TTY tools, always set timeout to 5000ms (5s)** to avoid hanging on unresponsive sessions — except `mcp__tty__start` which needs 10000ms (10s).

<a name="gui-mode"></a>

## Board Driver API

The `createBoardDriver()` function provides programmatic control of the TUI for AI exploration:

```typescript
import { createBoardDriver } from '@km/tui/driver.ts'
import { createFakeRepo } from '@km/storage'
import { item } from '@km/tui/tests/helpers/board-test.ts'

// Create driver with fixture
const nodes = item("board", item("col1", item("task1"), item("task2")))
const repo = createFakeRepo({ nodes })
const driver = createBoardDriver(repo, "board")

// Execute commands via press()
await driver.press('j')   // Move cursor down
await driver.press('/')   // Open search dialog

// Get rich state for AI decision-making
const state = driver.getState()
state.cursor       // { col: 0, card: 1, level: 'card' }
state.selectedNodeId  // 'task2'
state.dialogs      // { search: true, newItem: false, ... }
state.screen       // Full rendered text output
state.commands     // Array of available commands with metadata

// Command introspection (informational only)
driver.cmd.down.id    // 'cursor_down'
driver.cmd.down.name  // 'Move Down'
driver.cmd.down.keys  // ['j', 'ArrowDown']
driver.cmd.describe() // Human/AI-readable command list
```

**Use cases:**
- AI-driven exploration: Pick next action based on `getState()`
- Fuzz testing: Random command sequences with invariant checks
- Acceptance tests: Verify cursor movement, dialog state, navigation

## Sub-Skills

| File | Purpose |
|------|---------|
| [targeted.md](targeted.md) | User-described scenarios, vault verification |
| [random.md](random.md) | Setup, AI-driven exploration, fuzz testing |
| [reporting.md](reporting.md) | Reports, issue templates, action workflow |
| [peekaboo.md](peekaboo.md) | Live Ghostty terminal inspection via Peekaboo MCP |
| [repro.md](repro.md) | Reproducing unreproducible bugs, debug logging |

## See Also

- [tui/fix.md](../tui/fix.md) — Debug workflow for user-reported bugs (start here!)
- [tests/tui.md](../tests/tui.md) — Full TUI testing patterns and helpers
