---
description: Exploratory testing protocol for km TUI - interactive AI probing, TTY screenshots, team-based bug hunting
---

# Exploratory Testing

Adaptive, judgment-based testing where AI intelligence drives the exploration. Not scripted -- observe, hypothesize, investigate. Uses TTY MCP for real terminal interaction and screenshots for verification.

**Keywords**: explore, fuzz, random, bug hunting, TUI test, GUI/TTY test, repro, peekaboo

---

## Decision Tree

| User says | Action |
|-----------|--------|
| `/explore` (no args) | Team exploration -- interactive TTY + background health check |
| `/explore <broad description>` | Team exploration focused on that area |
| `/explore <specific bug repro>` | Targeted bug repro -- TUI tests primary, TTY verify |
| `/explore --fuzz` | Run fuzz suite only: `bun test:fuzz` |
| `/explore --gui` | Manual visual TTY mode (no team) |
| `/explore km view <path>` | Real vault diagnostics: `TEST_VAULT=<path> bun vitest run apps/km-tui/tests/real-vault.test.ts` |
| `/explore --chaos` | Chaos testing -- rapid keys, resize storms |
| `/explore --soak` | Long-run soak -- 1000+ actions, check for leaks |
| `/explore end` | End session -- summary, retrospective, bead cleanup |

---

## Philosophy

**Exploration means using AI intelligence to observe, hypothesize, and investigate.** The explorer launches the real TUI, looks at it, navigates, takes screenshots, and notices what feels off. Tests are a safety net, not the main event.

### Key Lessons

- **Invariant checks > manual inspection**: Runtime invariants that fire on every action find bugs that manual screenshot review misses. Check breadcrumbs, no internal IDs, no `[object Object]`, cursor on visible node -- after every action.
- **Real vault > synthetic fixtures for finding bugs**: Real data has the shapes that trigger bugs. But write tests against synthetic fixtures for reproducibility.
- **Parallel agents = parallel files**: Agents parallelize when they don't share files. Explorers write to `/tmp/`, fixers edit source (one bead at a time).
- **Update beads aggressively**: The session bead is the only thing that survives `/compact`.

---

## TTY MCP Tools

```
mcp__tty__start({command, cols, rows, cwd})  --> {sessionId}
mcp__tty__press({sessionId, key})
mcp__tty__type({sessionId, text})
mcp__tty__screenshot({sessionId, outputPath})   # ALWAYS use for verification
mcp__tty__wait({sessionId, stable, for, timeout})
mcp__tty__stop({sessionId})
mcp__tty__list()
```

**Key format**: Single chars (`j`, `k`), named keys (`Enter`, `Escape`, `ArrowDown`), modifiers (`Shift+n`, `Control+c`, `Meta+j`).

**Use screenshots** (`mcp__tty__screenshot`) for visual verification -- never text-only tools for visual bugs. Screenshots are the evidence.

---

## Session Structure

### Phase 1: Real Vault

Start with the user's actual vault (`--path` arg or `/tmp/vt` default). Real vaults catch layout issues with real-world data -- varied title lengths, nesting depths, empty sections.

### Phase 2: Synthetic Edge Cases

Create purpose-built fixtures for edge cases:

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

Test: empty columns, single-item columns, deep nesting (5+ levels), scrolling, mixed depths.

### Phase 3: Narrow Terminal

Restart at 80x24 -- the minimum practical size. Does layout degrade gracefully?

---

## What to Look For

- **Layout & alignment**: Column widths balanced? Borders aligned? Cursor visible?
- **Colors & styling**: Selected item highlighted? Folded items distinct? Raw ANSI codes showing?
- **Blank areas & artifacts**: Unexpected blank rows? Residual content from previous state?
- **Async glitches**: Content appearing incrementally? Stale state after navigation?
- **Truncation & overflow**: Long titles handled? Wide content pushing layout? Degrades at 80x24?
- **State consistency**: `h` always goes back? Cursor valid after fold/unfold? Cancel restores state?

---

## Targeted Exploration (User-Described Scenarios)

When the user describes a specific issue, **write a test IMMEDIATELY**:

1. Write a test reproducing the scenario
2. Set up the exact context (fixture, view mode, navigation)
3. Execute the described action sequence
4. Verify and report what happens
5. Expand with variations

```typescript
test("cursor should move down after searching for Justice", () => {
  const { board } = createDriverTest(() =>
    item("board", item("col",
      item("Task A"), item("Justice"), item("Task C")))
  )

  board.press("/")
  for (const c of "Justice") board.press(c)
  board.press("Enter")
  board.press("j")

  // cursor should be on Task C
  board.expect("#Task C[data-cursor]").toExist()
})
```

### Real Vault Debugging

```bash
TEST_VAULT=/path/to/vault bun vitest run apps/km-tui/tests/real-vault.test.ts
```

---

## Team-Based Exploration

Default mode for `/explore`. Five concurrent agents:

### Roles

1. **Lead (you)**: Coordinate, create session bead, route bugs, update dashboard, run final `bun fix && bun run test:all`. Never writes code.
2. **Health Check** (background): Runs test suite, reports failures only.
3. **Explorer -- Interactive** (primary): Launches real TUI via TTY MCP, navigates, takes screenshots, reports visual/UX issues.
4. **Explorer -- Targeted**: Writes TUI tests for edge cases in `/tmp/km-explore-tests/`.
5. **Reproducer**: Creates beads + failing tests from explorer reports. Deduplicates first.
6. **Fixer**: Implements fixes following /tdd --> /why --> /big protocol. Three-layer verification for visual bugs.

### Flow

```
health-check (background) --- test suite, reports regressions only

explorer-interactive ----(visual bugs)----+
                                          +--> reproducer --(tests)--> fixer
explorer-targeted -------(test bugs)-----/     (dedup)
```

### Session Bead

Create before spawning agents: `km-session.<MMDD><seq>`. The bead description is the live status dashboard. All agents share this ONE bead.

### TTY MCP Failure Protocol

If TTY tools become unavailable: **stop all work immediately**. No bugs can be fixed, closed, or verified without Layer 2 verification. Ask user to fix MCP, then resume.

### Stopping Criteria

Session ends when:
- Both explorers report convergence (100+ interactions without a new bug)
- All bugs are in a terminal state (Fixed/Deferred/Blocked)
- Reproducer and fixer pipelines are drained

---

## Visual Bug Report Format

```
VISUAL BUG: [description]
Terminal size: 120x40
Key sequence from startup: j j l k z l
Expected: [what should appear]
Actual: [what appears]
Screenshot: /tmp/explore-screenshots/NN-name.png
```

Include **every key pressed** from session start.

---

## Screenshot Naming

Save to `/tmp/explore-screenshots/` with descriptive names:

```
/tmp/explore-screenshots/01-startup.png
/tmp/explore-screenshots/02-navigation-deep.png
/tmp/explore-screenshots/03-fold-reflow.png
```

Prefix with sequence number. Name describes the state, not the action. Quality over quantity -- 8-12 screenshots per session.

---

## Reporting

### Session Dashboard (update after every bug state transition)

```
| # | Bead | P | Title | Status | Test | AI Verify | User |
|---|------|---|-------|--------|------|-----------|------|
| 1 | km-tui.body-collapse | 2 | Body collapse | Fixed | 3/3 | screenshot | confirmed |
| 2 | km-tui.fold-color | 2 | Fold count color | Open | -- | -- | -- |
```

Status: Open, Investigating, Fix in progress, TUI test pass, GUI/TTY verified, Awaiting user, Fixed, Reopened, Deferred.

### Close Reason

```
Session complete. N fixed, M deferred. Remaining: #3 (km-tui.X) awaiting user verification.
```

### Session Retrospective (mandatory)

Every session ends with forensic analysis:

- **Closure audit**: For each bug -- times reported, times assumed fixed, close accuracy, premature closure root cause
- **Test gap analysis**: What the test checked vs what the user saw, missing assertions
- **Process failures**: Dropped requests, stale dashboard, skipped verification
- **Lessons**: Skill doc updates, new anti-patterns

---

## Reproducing Unreproducible Bugs

### Search Prior Sessions First

```bash
bun recall "symptom keywords"
```

### Failed Reproduction Protocol

1. **Log what you tried** -- append to bead notes with exact key sequences, timing, vault used
2. **Use DEBUG_LOG** -- `DEBUG='km:*' DEBUG_LOG=/tmp/tui-debug.log`
3. **Check reproduction conditions** -- value must change, component must be mounted, real data may be needed
4. **Update steering docs** -- so next session doesn't repeat failed attempts

**P1 bugs: do NOT move on.** Escalate to user for pair debugging.

### Debug Namespaces

| Namespace | What it logs |
|-----------|--------------|
| `km:tui:render` | TreeNode rendering |
| `km:tui:card-layout` | Card layout calculations |
| `km:tui:nav` | Navigation handlers |
| `km:board` | Board state |

---

## Budgets

| Resource | Budget |
|----------|--------|
| Total actions | ~100 across all phases |
| Screenshots | 8-12 (quality over quantity) |
| Terminal sizes | 2+ (120x40 and 80x24 minimum) |

---

## Commands

```bash
# Real vault diagnostics
TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts

# Fuzz suite
bun test:fuzz
FUZZ_SEED=12345 bun test:fuzz

# Test sweep after multi-agent session
cd /Users/beorn/Code/pim/km ; bun run test:fast | head -400
```

---

## Anti-Patterns

- **Don't script blindly**: If something looks off, investigate -- don't move on
- **Don't screenshot everything**: 8-12 meaningful screenshots > 50 routine ones
- **Don't ignore gut feelings**: If a transition "felt weird", take a screenshot and note it
- **Don't skip phases**: Real vault and synthetic test different things
- **Never write explore tests to `apps/km-tui/tests/`**: Use `/tmp/km-explore-tests/` for exploration, promote only confirmed regressions by merging into existing domain files
