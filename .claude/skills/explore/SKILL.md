---
description: TUI exploration - interactive AI probing + targeted testing + randomized bug hunting. Use when exercising km view to find bugs, test scenarios, or inspect the live terminal.
argument-hint: [scenario | --gui | --fuzz | --peekaboo | --path <vault> | km view <path>]
---

# TUI Exploration

**Keywords**: explore, fuzz, random, bug hunting, TUI test, GUI/TTY test, repro, peekaboo, ghostty

## Decision Tree — Pick ONE, Act Immediately

**Parse the arguments first, then run the right command:**

| User says | Action | Command |
|-----------|--------|---------|
| `/explore` (no args) | **Team exploration** — interactive TTY + background health check | See [team.md](team.md) |
| `/explore <broad description>` | **Team exploration** — focused interactive + health check | See [team.md](team.md) |
| `/explore <specific bug repro>` | Targeted bug repro — TUI tests primary, GUI/TTY verify | See [targeted.md](targeted.md) + [team.md](team.md) |
| `/explore --fuzz` | Run fuzz suite only (no team, no TTY) | `bun test:fuzz` |
| `/explore --gui` or `/explore --gui <path>` | Visual TTY mode (manual, no team) | See [TTY section](#gui-mode) below |
| `/explore km view <path>` or `/explore --path <path>` | Test real vault with diagnostics | `TEST_VAULT=<path> bun vitest run apps/km-tui/tests/real-vault.test.ts` |
| `/explore --compare` | Asana vs km TUI comparison | See [compare.md](compare.md) |
| `/explore --peekaboo ...` | Live Ghostty inspection | See [peekaboo.md](peekaboo.md) |
| `/explore end` or `/explore finish` | **End session** — summary, retrospective, bead cleanup | See [end.md](end.md) |

**Session tracking**: Team and solo modes create a session bead (`km-session.<MMDD><seq>`) for persistent tracking. Quick modes (`--fuzz`, `--path`) skip this. See [reporting.md](reporting.md) for conventions.

**Smart routing rule**: If the args describe *what to explore*, include interactive TTY as the main activity. If they describe *a specific bug to reproduce*, lead with TUI tests but verify interactively. If `--fuzz`, tests only.

**Real-vault first**: Before running fuzz exploration, run a real-vault pass (`/explore --path <vault>`) to catch environment-specific issues that fuzz tests with synthetic data won't find. Real vaults exercise file I/O, encoding edge cases, and large-node rendering that synthetic fixtures miss.

**Do NOT**: read fuzz test source files, try deprecated scripts, or guess vitest CLI flags. The commands above work as-is.

## Examples

```
/explore                            # Team: interactive TTY + health check
/explore recent batch ops           # Team: focused on batch operations area
/explore cursor jumps after indent  # Targeted: TUI test repro + GUI/TTY verify
/explore --fuzz                     # Fuzz suite only (bun test:fuzz)
/explore --gui                      # Manual visual mode with screenshots
/explore --peekaboo                 # Inspect your live Ghostty terminal

/explore km view /tmp/vt            # Real vault diagnostics (TEST_VAULT)
/explore --path /tmp/tst-vault      # Same thing
```

## Commands

```bash
# all bun commands should be preceded with `cd ${repoRoot} ;`

# Default: team exploration (spawns interactive + health-check + targeted + reproducer + fixer)
# Just run /explore — see team.md for details

# Real vault diagnostics (incremental render checks, fold/unfold, random nav)
TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts

# Fuzz suite only (no team, just run tests)
bun test:fuzz                                    # All fuzz tests (manual, unbounded)
bun test:fuzz apps/km-tui/tests/navigation-fuzz  # Specific fuzz file
FUZZ_SEED=12345 bun test:fuzz                    # Reproducible run
# Note: fuzz tests also run as phase 6 of `bun run test:ci` (bounded: FUZZ_REPEATS=1000)
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
3. Write repro test in `/tmp/km-explore-tests/` first, then promote to the appropriate EXISTING test file in `apps/km-tui/tests/` (merge into the relevant file, don't create new explore-* files)
4. Reference bead in test comment (e.g., "See bead km-xyz")

**IMPORTANT:** Never write explore-* test files to `apps/km-tui/tests/`. Exploration tests go to `/tmp/km-explore-tests/`. Only promote confirmed bug regressions by merging into existing test files.

## Modes

| Mode | Speed | Use Case |
|------|-------|----------|
| **Interactive (team default)** | ~1/s per action | AI-driven TTY exploration — observe, hypothesize, investigate |
| **TUI tests** | Fast (~1000/s) | `bun test:fuzz`, `TEST_VAULT=...`, DOM-level checks |
| **GUI (`--gui`)** | ~1/s | Manual pixel verification, visual bugs |
| **Peekaboo (`--peekaboo`)** | Interactive | Inspect live Ghostty terminal |
| **Targeted** | Varies | User-described scenario first, then expand |

**Mode selection**: `/explore` (no args or broad description) uses interactive TTY as the main activity with TUI tests as a background health check. For specific bug repros, TUI tests are primary. For `--fuzz`, tests only. See [interactive.md](interactive.md) for the interactive philosophy.

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

## Test Sweep — Find and Fix Broken Tests

After multi-agent sessions, tests may be left broken. See [tests/SKILL.md](../tests/SKILL.md) for test commands.

```bash
cd /Users/beorn/Code/pim/km ; bun run test:fast | head -400
```

**Triage failures:**

| Failure type | Action |
|---|---|
| Test references removed/renamed code | Update test to match current code |
| Test expects old behavior after intentional change | Update assertion to match new behavior |
| Test has a genuine bug (regression) | Fix the bug, don't just fix the test |
| Flaky test (passes on re-run) | Add `.retry(2)` or fix the race condition |
| Test file left as `*-repro*` or `*-debug*` | Promote to regression test or delete |

Create beads for any genuine regressions found. For test-only fixes (updating assertions after intentional changes), no bead needed.

## Sub-Skills

| File | Purpose |
|------|---------|
| [team.md](team.md) | **Agent team**: health-check + interactive + targeted + reproducer + fixer pipeline |
| [interactive.md](interactive.md) | **Interactive exploration**: TTY philosophy, tools, visual bug reporting |
| [targeted.md](targeted.md) | User-described scenarios, vault verification |
| [random.md](random.md) | Setup, AI-driven exploration, fuzz testing |
| [reporting.md](reporting.md) | Reports, issue templates, action workflow |
| [peekaboo.md](peekaboo.md) | Live Ghostty terminal inspection via Peekaboo MCP |
| [compare.md](compare.md) | **Asana vs km TUI comparison**: side-by-side data/rendering gap analysis |
| [repro.md](repro.md) | Reproducing unreproducible bugs, debug logging |

## See Also

- [tui/fix.md](../tui/fix.md) — Debug workflow for user-reported bugs (start here!)
- [tests/tui.md](../tests/tui.md) — Full TUI testing patterns and helpers
