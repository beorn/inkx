# Team-Based Exploration

Three-agent pipeline for finding and fixing bugs fast. Explorer discovers via headless scripts, reproducer writes failing tests, fixer implements fixes.

## When to Use

- Extended exploration (user asks for thorough bug hunting)
- `/explore` with a scenario that likely has multiple bugs
- User says "explore and fix", "find and fix bugs"

## Speed Principle

**TTY is slow (~1 action/sec). Headless is fast (~1000 actions/sec).**

The explorer writes and runs headless exploration scripts that exercise hundreds of interactions in seconds. TTY is only for visual spot-checks and verification after fixes.

## Team Setup

```
TeamCreate(team_name="explore-<vault-name>")
```

Spawn two teammates (you are the explorer lead):

```
Task(team_name="...", name="reproducer", subagent_type="general-purpose", prompt="...")
Task(team_name="...", name="fixer", subagent_type="general-purpose", prompt="...")
```

## Roles

### 1. Explorer (you, the lead)

**Primary method**: Write and run headless test scripts against real vault data or synthetic fixtures.

**Workflow**:
1. Write a quick exploration script as a vitest file
2. Run it: `bun vitest run <file>` (~instant for hundreds of actions)
3. Analyze output for bugs (assertions, cursor state, DOM anomalies)
4. When bug found: send to reproducer with exact key sequence + state
5. Continue writing more exploration scripts while they work
6. Use TTY only for visual verification when fixer reports a fix done

**Exploration script template** (write in `apps/km-tui/tests/`):

```typescript
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// Or for real vault: testEnvWithRepo
// import { testEnvWithRepo } from "./helpers/board-test.ts"

describe("Exploration: [scenario]", () => {
  test("[N] interactions — [description]", () => {
    const { board, repo } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B"), item("C")),
        item("col2", item("D"), item("E")),
      ),
    )

    const bugs: string[] = []

    for (let i = 0; i < 100; i++) {
      const action = ["j", "k", "n", "Tab", "l", "h"][i % 6]!
      try {
        board.press(action)
      } catch (e) {
        bugs.push(`[i=${i}] ${action}: THREW ${e}`)
        continue
      }

      // Check cursor exists
      const cursor = board.q("[data-cursor]")
      if (!cursor || cursor.count() === 0) {
        bugs.push(`[i=${i}] ${action}: no [data-cursor]`)
      }

      // Check for rendering garbage
      const text = board.textContent()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push(`[i=${i}] ${action}: garbage in output`)
      }
    }

    expect(bugs).toEqual([])
  })
})
```

**For real vault exploration** (uses actual vault data):
```bash
TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts
```

**For targeted scenarios** (embeds, specific node types):
```typescript
// Build fixture that matches the real scenario
const { board, repo } = testEnv(() => {
  const nodes = item("board", item("processing",
    item("embed1"), item("embed2"), item("thoughts"),
  ))
  // Set up embeds: add link_to, remove depth
  for (const n of nodes) {
    if (n.id.startsWith("embed")) {
      n.link_to = "some-target"
      n.type = "paragraph"
    }
    if (n.id === "processing") {
      n.data = { depth: 2 }
    }
  }
  return nodes
})
```

**Bug report to reproducer** — include exact state:
```
SendMessage(recipient="reproducer", content="""
BUG: [description]
Key sequence: [j, j, n, Escape, Tab] from card index 0
Fixture: item("board", item("col", item("A"), item("B")))
Cursor before: card index 2
Cursor after: MISSING (no [data-cursor])
Error (if any): [message]
""")
```

### 2. Reproducer

**Spawned with prompt**:
```
You are a bug reproducer for km TUI. When the explorer sends a bug:

1. Create a bead:
   cd /Users/beorn/Code/pim/km && bd create --type=bug --priority=2 --title="TUI: [description]"
   bd update <id> --parent km-tui
   bd update <id> --claim

2. Write a FAILING headless test:
   File: apps/km-tui/tests/<descriptive-name>.test.ts
   Use testEnv() + item() from ./helpers/board-test.ts
   The test MUST FAIL — it documents the bug

3. Confirm it fails: bun vitest run <test-file>

4. Send bead ID + test path to fixer

DO NOT fix bugs. DO NOT run bun fix or bun run test:all.
```

### 3. Fixer

**Spawned with prompt**:
```
You are a bug fixer for km TUI. When the reproducer sends a failing test:

1. Read the test to understand the bug
2. Investigate root cause in source
3. Implement minimal fix
4. Confirm test passes: bun vitest run <test-file>
5. Check regressions: bun vitest run apps/km-tui/tests/
6. Close bead: bd close <id> --reason "Fixed: [description]"
7. Notify explorer for manual verification

DO NOT run bun fix or bun run test:all — lead handles that.

Architecture:
- Board actions: apps/km-tui/src/board/board-actions-edit.ts
- Keyboard ops: apps/km-tui/src/keyboard/keyboard-card-ops.ts
- Layout: apps/km-tui/src/views/ColumnsView.tsx
- Storage sync: packages/km-storage/src/watch/
```

## Flow

```
Explorer writes script ──(run, find bug)──> Reproducer ──(test)──> Fixer
    │                                                                  │
    │ (keeps writing more scripts)                                     │
    └──────────────(fix done, TTY verify)──────────────────────────────┘
```

## Shutdown

1. Send shutdown to reproducer and fixer
2. Run `bun fix && bun run test:all` from lead
3. Commit + push
4. `TeamDelete()`
