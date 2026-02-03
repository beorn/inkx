---
description: TUI exploration - targeted scenario testing + randomized bug hunting
argument-hint: [scenario | 100 | --gui | --peekaboo | --seed <n> | --path <vault>]
---

# TUI Exploration Testing

**Keywords**: explore, fuzz, random, bug hunting, TUI test, visual test, repro, peekaboo, ghostty

Exercises `km view` to discover bugs and performance issues. Supports:
- **Targeted exploration**: User describes a scenario, we test it + variations
- **Randomized testing**: Weighted random actions to find edge cases
- **Live terminal inspection**: Use Peekaboo to investigate your running Ghostty terminal

## Quick Reference

| Argument | Description |
|----------|-------------|
| `<N>` | Number of iterations (default: 100) |
| `--gui` | Visual mode via ttyd/Playwright (pixel-level) |
| `--peekaboo` | Inspect live Ghostty terminal via Peekaboo MCP |
| `--seed <n>` | Fixed seed for reproducibility |
| `--path <vault>` | Use existing vault instead of generated data |

**Examples:**
```
/explore 50              # Quick 50-iteration headless run
/explore --seed 12345    # Reproducible run
/explore --gui           # Visual mode with screenshots
/explore --path /tmp/tst-vault-linking  # Test existing vault
/explore --peekaboo      # Inspect your live Ghostty terminal

# Targeted exploration (describe the scenario)
/explore going down after "Justice" node causes cursor to jump
/explore switching from cards to list view loses cursor position
/explore zoom into Projects folder then press j

# Live investigation with Peekaboo
/explore --peekaboo check why the cursor is misaligned
/explore --peekaboo investigate the rendering glitch in cards view
```

## Default Workflow (TUI Mode)

**Run the exploration script:**

```bash
# Quick run (random seed)
bun scripts/explore-tui.ts --iterations 100

# Reproducible run
bun scripts/explore-tui.ts --iterations 100 --seed 12345

# Quiet mode for CI
bun scripts/explore-tui.ts --iterations 100 --quiet

# JSON output for processing
bun scripts/explore-tui.ts --iterations 100 --json

# With real vault
bun scripts/explore-tui.ts --path /path/to/vault
```

**What it verifies (both DOM and buffer):**

| Check | What | Issue Type |
|-------|------|------------|
| Cursor count | Exactly 1 `[data-cursor]` | `multiple-cursors`, `missing-cursor` |
| Required elements | `#board`, `#bottom-bar` exist | `missing-board`, `missing-bottom-bar` |
| Buffer content | No `[object Object]`, no errors | `object-object`, `error-in-buffer` |
| View mode | Indicator present, `v` cycles mode | `missing-view-mode`, `view-mode-unchanged` |

**When bugs are found:**
1. Script outputs reproduce command with seed
2. Create bead: `bd create "TUI: [description]" --type=bug`
3. Add test to `apps/km-tui/tests/` with `.skip` if not fixing now
4. Reference bead in test comment (e.g., "See bead km-xyz")

## Modes

| Mode | Speed | Use Case |
|------|-------|----------|
| **TUI (default, PREFERRED)** | Fast (~1000/s) | Rapid iteration, DOM-level checks |
| **GUI (`--gui`)** | Slower (~1/s) | Pixel verification, visual bugs |
| **Peekaboo (`--peekaboo`)** | Interactive | Inspect live Ghostty terminal |
| **Targeted** | Varies | User-described scenario first, then expand |

**IMPORTANT: Always prefer TUI mode** (headless `testEnv()`/`board.press()`/`board.screenshot()`) over GUI/TTY mode. TUI tests are faster, more reliable, and catch character-level issues. Only use `--gui` (TTY/Playwright) when pixel-level visual verification is explicitly needed. **If you must use TTY tools, always set timeout to 10000ms (10s)** to avoid hanging on unresponsive sessions.

---

## Targeted Exploration (User-Described Scenarios)

When the user describes a specific issue or scenario, **explore that scenario first** before randomized testing.

### Detecting User Scenarios

Look for patterns in user input:
- "going down after X" → Navigate to X, then press `j`
- "pressing Y on Z" → Navigate to Z, then press Y
- "switching views when..." → Specific view mode transitions
- "zoom into X and then..." → Navigate to X, zoom, then action

### Workflow for Targeted Exploration

1. **Parse the scenario** from user description
2. **Set up the exact context** (navigate to element, set view mode, etc.)
3. **Execute the described action sequence**
4. **Verify and report** what happens
5. **Expand around the scenario** with variations:
   - Same action on nearby elements
   - Same action in different view modes
   - Similar actions (j→k, h→l)
   - Same sequence after different navigation paths

### Example: "going down after Justice node"

```typescript
// 1. Set up: Navigate to "Justice" node
// Use search or direct navigation to find the node
board.press("/")  // Open search
board.type("Justice")
board.press("Enter")  // Select result

// 2. Execute described action
const before = board.screenshot()
board.press("j")  // "going down"
const after = board.screenshot()

// 3. Verify
const cursorMoved = before !== after
const bellRang = board.bell
console.log({ cursorMoved, bellRang, before, after })

// 4. Expand with variations
const variations = [
  { action: "k", desc: "going up instead" },
  { action: "j", repeat: 5, desc: "going down 5 times" },
  { viewMode: "list", action: "j", desc: "same in list view" },
  { viewMode: "columns", action: "j", desc: "same in columns view" },
]

for (const v of variations) {
  // Reset to Justice node, apply variation, verify
}
```

### GUI Mode Targeted Exploration

```typescript
// Using existing vault with the problematic node
const { sessionId } = await mcp__tty__start({
  command: ["bun", "km", "view", userVaultPath]
})

// Navigate to the node
await mcp__tty__press({ sessionId, key: "/" })
await mcp__tty__type({ sessionId, text: "Justice" })
await mcp__tty__press({ sessionId, key: "Enter" })
await mcp__tty__wait({ sessionId, stable: 100 })

// Capture before
const beforeText = await mcp__tty__text({ sessionId })
const beforeShot = await mcp__tty__screenshot({ sessionId })

// Execute action
await mcp__tty__press({ sessionId, key: "j" })
await mcp__tty__wait({ sessionId, stable: 100 })

// Capture after
const afterText = await mcp__tty__text({ sessionId })
const afterShot = await mcp__tty__screenshot({ sessionId })

// Report findings with visual evidence
```

### Targeted Report Format

```markdown
# Targeted Exploration: [User Scenario]

## Scenario
"going down after Justice node"

## Initial Test
- **Setup**: Searched for "Justice", cursor on node
- **Action**: Press `j` (move down)
- **Result**: [describe what happened]
- **Expected**: Cursor moves to next sibling or child

## Variations Tested

| # | Variation | Result |
|---|-----------|--------|
| 1 | Press `k` (up) after Justice | [result] |
| 2 | Press `j` 5x | [result] |
| 3 | Same in list view | [result] |
| 4 | Same in columns view | [result] |
| 5 | Different node, same action | [result] |

## Findings
- [Bug/issue if found]
- [Pattern observed]

## Random Exploration (N additional iterations)
[Continue with standard randomized testing]
```

---

## Data Source Verification (Real Vaults)

When testing a real vault (`--path`), verify the TUI matches the filesystem:

### Pre-flight Checks

1. **Ensure vault is synced** - check `.km/state.db` has nodes:
   ```bash
   sqlite3 /path/to/.km/state.db "SELECT COUNT(*) FROM nodes;"
   # If 0 or 1, run: bun km sync /path/to/vault
   ```

2. **Explore filesystem structure** before running TUI:
   ```bash
   ls -la /path/to/vault/
   find /path/to/vault -maxdepth 2 -type d | head -20
   find /path/to/vault -name "*.md" | wc -l
   ```

3. **Note expected content** for verification:
   - Top-level folders (inbox, projects, areas, etc.)
   - Key files that should appear
   - Expected node count (from sqlite query)

### TUI vs Filesystem Verification

After loading the vault in TUI mode:

```typescript
// Load vault
const repo = await runGenerator(createRepo(vaultPath, { loadFiles: true }))

// Get root and children from repo
const rootNode = repo.getRepoRootNode()
const rootChildren = repo.getChildren(rootNode.id)

console.log(`Filesystem children:`)
for (const child of rootChildren) {
  const name = child.data?.name || child.content || child.id
  console.log(`  - ${name} (${child.type})`)
}

// Render and check text output
const text = result.text

// Verify expected folders appear
const expected = ["inbox", "projects", "areas"]  // from filesystem exploration
for (const folder of expected) {
  const found = text.toLowerCase().includes(folder.toLowerCase())
  console.log(`${found ? "✓" : "✗"} "${folder}" ${found ? "visible" : "NOT visible"}`)
}
```

### Content Mismatch Detection

Check for discrepancies:

| Check | How | Issue If |
|-------|-----|----------|
| Node count | `repo.getAllTasks().length` vs `sqlite3 ... nodes` | Mismatch > 10% |
| Root children | `repo.getChildren(rootId)` vs `ls vault/` | Missing folders |
| Visible text | `result.text` contains folder names | Expected content hidden |
| Empty board | Text shows "Empty board" | Vault not synced |

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Empty board" | Vault not synced | `bun km sync /path` |
| 0 or 1 nodes | Database empty | `bun km sync /path` |
| Missing folders | Wrong root zoom level | Navigate with `u` to zoom out |
| ULID-like names | Raw IDs shown | Check node.data.name vs node.id |

---

## Phase 1: Setup

### Parse Arguments

From `$ARGUMENTS`:
- Extract iteration count (number, default 100)
- Check for `--gui` flag
- Extract `--seed <n>` if present
- Extract `--path <vault>` if present

### Generate Test Data (if no --path)

**TUI Mode with fixtures** - use `testEnv()` with `item()`:

```typescript
import { testEnv, item } from "apps/km-tui/tests/helpers/board-test"

const { board } = testEnv(() =>
  item("board",
    item("col1", item("task1"), item("task2")),
    item("col2", item("task3"))
  ),
  { rows: 24, columns: 80 }
)
```

**TUI Mode with real vault** - use `createRepo`:

```typescript
import React from "react"
import { createTestRenderer } from "inkx/testing"
import { createRepo, runGenerator } from "@km/storage"
import { Board } from "../src/views/Board.tsx"
import { buildBoardState } from "../src/state.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../src/command-bridge.ts"

// Load real vault
const repo = await runGenerator(createRepo(vaultPath, { loadFiles: true }))
const rootNode = repo.getRepoRootNode()
const initialState = buildBoardState(repo, rootNode.id)

ensureCommandSystemInitialized()

// Render with inkx test renderer
const render = createTestRenderer({ columns: 80, rows: 24 })
const result = render(
  React.createElement(RepoProvider, { repo,
    children: React.createElement(Board, {
      initialState,
      initialViewMode: "cards",
      dimensions: { columns: 80, rows: 24 },
      onExit: () => {},
      layoutRegistry: createLayoutRegistry(),
    })
  })
)

// Now use result.text for screenshots, result.press(key) for actions
```

**GUI Mode** - use MCP TTY tools:

```typescript
// Start session with km view
const { sessionId } = await mcp__tty__start({
  command: ["bun", "km", "view", vaultPath]
})

// Wait for initial render
await mcp__tty__wait({ sessionId, for: "VIEW" })
```

### Initialize Random with Seed

```typescript
class SeededRandom {
  private seed: number
  constructor(seed: number) { this.seed = seed }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  weighted<T>(items: { weight: number; value: T }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let r = this.next() * total
    for (const item of items) {
      r -= item.weight
      if (r <= 0) return item.value
    }
    return items[items.length - 1].value
  }
}
```

---

## Phase 2: Exploration Loop

```
for iteration = 1 to N:
  1. Read current state
  2. Select action (weighted + context-aware)
  3. Execute action
  4. Verify invariants
  5. Log issues (don't abort)
  6. Progress report every 10 iterations
```

### Action Categories & Weights

| Category | Weight | Keys |
|----------|--------|------|
| Navigation | 40% | `j`, `k`, `h`, `l`, `g`, `G`, `Control+d`, `Control+u` |
| View Modes | 15% | `v`, `+`, `-`, `<`, `>` |
| Zoom/Fold | 15% | `o` (zoom in), `u` (zoom out), `z` (fold) |
| Dialogs | 10% | `/` (search), `n` (new), `p` (project), `?` (help) |
| Selection | 10% | `A`, `Shift+ArrowDown`, `Shift+ArrowUp` |
| Edit | 5% | `Space` (toggle), `x` (archive), `m` (move) |
| Board Switch | 5% | `1`-`9` (favorites) |

### Context-Aware Adjustments

```typescript
function selectAction(rng: SeededRandom, context: Context): string {
  const actions = [...baseActions]

  // In dialog: boost navigation + escape
  if (context.inDialog) {
    boost(actions, ["j", "k", "Enter", "Escape"], 2.0)
  }

  // At boundary: boost opposite direction
  if (context.atTopBoundary) boost(actions, ["j", "G", "Control+d"], 1.5)
  if (context.atBottomBoundary) boost(actions, ["k", "g", "Control+u"], 1.5)
  if (context.atLeftBoundary) boost(actions, ["l"], 1.5)
  if (context.atRightBoundary) boost(actions, ["h"], 1.5)

  // Deep in tree: boost zoom-out
  if (context.zoomDepth > 2) boost(actions, ["u"], 2.0)

  // Every 10th iteration: boost view mode cycling
  if (context.iteration % 10 === 0) boost(actions, ["v"], 3.0)

  return rng.weighted(actions)
}
```

### Execute Action

**TUI Mode:**
```typescript
const before = board.screenshot()
const startTime = performance.now()
board.press(action)
const renderTime = performance.now() - startTime
const after = board.screenshot()
```

**GUI Mode:**
```typescript
const before = await mcp__tty__text({ sessionId })
await mcp__tty__press({ sessionId, key: action })
await mcp__tty__wait({ sessionId, stable: 100 })
const after = await mcp__tty__text({ sessionId })
```

---

## Phase 3: Verification

### Invariants to Check After Each Action

**TUI Mode (DOM-level):**
```typescript
// 1. No crash - content exists
const text = board.screenshot()
expect(text.length).toBeGreaterThan(0)

// 2. Cursor exists (unless in dialog)
if (!context.inDialog) {
  board.expect("[data-cursor]").toExist()
}

// 3. No error strings
expect(text).not.toContain("undefined")
expect(text).not.toContain("[object Object]")
expect(text).not.toMatch(/Error:|TypeError:|ReferenceError:/)

// 4. Bell only on boundary (expected)
if (board.bell && !context.atBoundary) {
  issues.push({ type: "unexpected-bell", iteration, action })
}

// 5. Content changed OR bell (something happened)
if (before === after && !board.bell) {
  issues.push({ type: "no-effect", iteration, action })
}
```

**GUI Mode (text/visual):**
```typescript
const text = await mcp__tty__text({ sessionId })

// 1. Terminal has content
expect(text.length).toBeGreaterThan(0)

// 2. No error messages
expect(text).not.toContain("Error:")
expect(text).not.toContain("undefined")

// 3. Visual check (periodic)
if (iteration % 10 === 0) {
  const screenshot = await mcp__tty__screenshot({ sessionId })
  // Inspect for visual glitches
}
```

### Performance Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Navigation (j/k/h/l) | >50ms = slow | Basic cursor movement |
| View mode switch | >200ms = slow | Cycling cards/list/columns/tabs |
| Zoom in/out | >150ms = slow | Drill in/out latency |
| Dialog open | >200ms = slow | Search, new item, project picker |
| Scroll (Ctrl+D/U) | >100ms = slow | Page up/down |

```typescript
if (renderTime > threshold) {
  performance.push({
    iteration,
    action,
    time: renderTime,
    threshold,
    context: { viewMode, nodeCount, zoomDepth }
  })
}
```

---

## Phase 4: Cleanup & Report

### Cleanup

**TUI Mode:** No cleanup needed (in-memory)

**GUI Mode:**
```typescript
await mcp__tty__stop({ sessionId })
// Clean temp vault if generated
```

### Generate Report

```markdown
# Exploration Report

**Seed**: 12345 | **Iterations**: 100 | **Mode**: TUI

## Summary

| Metric | Count |
|--------|-------|
| Bugs found | 2 |
| Performance issues | 3 |
| Actions executed | 100 |
| View modes tested | 4/4 |
| Max zoom depth | 3 |

## Bugs Found

### 1. Unexpected bell on 'v' key
**Iteration**: 47 | **Seed**: 12345
**Action**: Press 'v' to cycle view mode
**Context**: In columns view, cursor on task-5

Bell triggered without being at boundary.

**Reproduce**: `/explore --seed 12345` (stops at iteration 47)

### 2. No effect on 'j' key
**Iteration**: 73 | **Seed**: 12345
**Action**: Press 'j' (move down)
**Context**: In list view, cursor on task-12

Neither content changed nor bell triggered.

## Performance Issues

| Iteration | Action | Time | Threshold | Context |
|-----------|--------|------|-----------|---------|
| 23 | v (view) | 312ms | 200ms | columns->list, 47 nodes |
| 67 | v (view) | 287ms | 200ms | list->cards, 47 nodes |
| 91 | o (zoom) | 178ms | 150ms | depth 2->3 |

## Coverage

- **View modes**: cards, columns, list, tabs
- **Dialogs**: search, new item
- **Zoom depth**: 0-3
- **Actions**: j(23), k(18), v(12), ...
```

---

## Issue Templates

### Bug Report

```markdown
## Bug: [Brief description]
**Seed**: <seed> | **Iteration**: <n>
**Action**: <key> - <description>

### Context
- View mode: <mode>
- Cursor: on <element>
- Zoom depth: <n>

### Before/After
\`\`\`
[Terminal text diff or description]
\`\`\`

### Reproduce
/explore --seed <seed>
```

### Performance Report

```markdown
## Slow: [Action description]
**Seed**: <seed> | **Iteration**: <n>
**Action**: <key>
**Time**: <ms>ms (threshold: <threshold>ms)

### Context
- View mode: <mode>
- Node count: <n>
- Zoom depth: <n>

### Likely cause
[Analysis of what might be slow]
```

---

## Action-Oriented Workflow

**IMPORTANT**: Don't ask for permission - fix issues as you find them.

When issues are discovered:
1. **Create bead** immediately with `bd create`
2. **Claim it** with `bd update <id> --claim`
3. **Fix it** directly - investigate code, implement fix
4. **Verify** the fix works
5. **Close bead** with `bd close <id> --reason "..."`
6. **Continue** exploring for more issues

```bash
# Bug - create, claim, fix, close
bd create --type=bug --priority=2 --title="TUI: [issue]"
bd update <id> --claim
# ... fix the issue ...
bd close <id> --reason "Fixed by [description]"

# Performance
bd create --type=bug --priority=3 --title="Perf: [issue]"
bd update <id> --claim --add-label "performance"
# ... fix the issue ...
bd close <id> --reason "Optimized [description]"
```

---

## Exploration Summary

At the end of exploration, provide a concise summary:

```markdown
# Exploration Summary

**Vault**: /path/to/vault
**Mode**: TUI/GUI/Peekaboo
**Duration**: [time]

## Beads Created
| ID | Title | Status |
|----|-------|--------|
| km-abc | TUI: Empty columns after scroll | ✅ Fixed |
| km-xyz | Perf: Slow view switch | 🔧 Open |

## Issues Found
- **Bugs**: 2 found, 1 fixed, 1 open
- **Performance**: 1 issue identified
- **Rendering**: All views verified

## Coverage
- View modes: cards ✓, columns ✓, list ✓, tabs ✓
- Actions tested: 47
- Columns navigated: 7
- Scroll positions tested: 12

## Files Modified
- `apps/km-tui/src/views/ColumnsView.tsx` - Fixed scroll offset bug
```

---

## Verification Checklist

Before reporting complete:

- [ ] All iterations completed (or stopped at first bug if requested)
- [ ] Bugs found → beads created → fixes attempted
- [ ] Summary table generated with bead status
- [ ] Files modified listed
- [ ] Coverage stats show what was tested

---

## Dependencies

**TUI Mode:**
- `testEnv()`, `item()` from `apps/km-tui/tests/helpers/board-test.ts`
- `board.press()`, `board.screenshot()`, `board.expect()` API

**GUI Mode:**
- MCP TTY: `mcp__tty__start`, `mcp__tty__press`, `mcp__tty__text`, `mcp__tty__screenshot`, `mcp__tty__stop`, `mcp__tty__wait`

**Peekaboo Mode:**
- Peekaboo MCP: `mcp__peekaboo__list`, `mcp__peekaboo__see`, `mcp__peekaboo__image`, `mcp__peekaboo__app`, `mcp__peekaboo__type`, `mcp__peekaboo__click`, `mcp__peekaboo__hotkey`

**Shared:**
- SeededRandom for reproducibility
- Weighted action selection

---

## Peekaboo Mode (Live Terminal Inspection)

Use Peekaboo MCP to inspect your live Ghostty terminal running `km view`. This mode is interactive - you guide the exploration and Claude helps investigate.

### When to Use Peekaboo

- **Live debugging**: You have km view running and see a visual bug
- **Interactive investigation**: Want to explore an issue step-by-step with AI assistance
- **Capture evidence**: Get screenshots of rendering glitches
- **No test setup needed**: Works on your actual running app

### Setup

1. **Start km view** in a Ghostty terminal window
2. **Run** `/explore --peekaboo` (optionally with a scenario description)
3. **Claude finds Ghostty** and captures the current state

### Peekaboo Workflow

```
1. List windows → Find Ghostty running km view
2. Capture screenshot → Analyze current state
3. Ask user what to investigate
4. Interactive loop:
   a. User describes issue or requests action
   b. Claude captures/analyzes/suggests
   c. Claude can type/click/hotkey to interact
   d. Capture result and compare
5. Document findings
```

### Peekaboo Tools Reference

| Tool | Purpose | Example |
|------|---------|---------|
| `mcp__peekaboo__list` | List all windows | Find Ghostty |
| `mcp__peekaboo__see` | Get window info | Check Ghostty window ID |
| `mcp__peekaboo__image` | Capture screenshot | Get current terminal state |
| `mcp__peekaboo__app` | Focus application | Bring Ghostty to front |
| `mcp__peekaboo__type` | Type text | Enter commands |
| `mcp__peekaboo__hotkey` | Send key combo | Press j, k, v, etc. |
| `mcp__peekaboo__click` | Click at coordinates | Click on UI elements |

### Finding Ghostty

```typescript
// List all windows to find Ghostty
const windows = await mcp__peekaboo__list()
const ghostty = windows.find(w =>
  w.app === "Ghostty" || w.title.includes("km view")
)

if (!ghostty) {
  console.log("Please open Ghostty with km view running, then try again")
  return
}

// Focus Ghostty
await mcp__peekaboo__app({ app_target: "Ghostty" })
```

### Capturing Terminal State

```typescript
// Capture current screenshot
const screenshot = await mcp__peekaboo__image({
  app_target: "Ghostty"
})

// Analyze what's visible:
// - Cursor position
// - View mode (cards/list/columns/tabs)
// - Any visible errors or glitches
// - Content being displayed
```

### Interactive Actions

```typescript
// Send keypresses to Ghostty
// Navigation
await mcp__peekaboo__hotkey({ key: "j" })  // Move down
await mcp__peekaboo__hotkey({ key: "k" })  // Move up
await mcp__peekaboo__hotkey({ key: "h" })  // Move left
await mcp__peekaboo__hotkey({ key: "l" })  // Move right

// View modes
await mcp__peekaboo__hotkey({ key: "v" })  // Cycle view mode

// Zoom
await mcp__peekaboo__hotkey({ key: "o" })  // Zoom in
await mcp__peekaboo__hotkey({ key: "u" })  // Zoom out

// Special keys (use modifiers)
await mcp__peekaboo__hotkey({ key: "d", modifiers: ["control"] })  // Ctrl+D (page down)
await mcp__peekaboo__hotkey({ key: "u", modifiers: ["control"] })  // Ctrl+U (page up)
```

### Comparison Workflow

```typescript
// Before state
await mcp__peekaboo__app({ app_target: "Ghostty" })
const before = await mcp__peekaboo__image({ app_target: "Ghostty" })
// Describe what you see: cursor on X, view mode Y, etc.

// Perform action
await mcp__peekaboo__hotkey({ key: "j" })
await new Promise(r => setTimeout(r, 100))  // Wait for render

// After state
const after = await mcp__peekaboo__image({ app_target: "Ghostty" })
// Compare: did cursor move? Any visual changes? Unexpected behavior?
```

### Example: Investigate Cursor Jump

User: `/explore --peekaboo cursor jumps when pressing j on certain items`

```typescript
// 1. Find and focus Ghostty
await mcp__peekaboo__app({ app_target: "Ghostty" })

// 2. Capture initial state
const initial = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "I see km view in cards mode, cursor on 'Project Alpha'"

// 3. Navigate to reproduce
await mcp__peekaboo__hotkey({ key: "/" })  // Open search
await mcp__peekaboo__type({ text: "Justice" })
await mcp__peekaboo__hotkey({ key: "Return" })
await new Promise(r => setTimeout(r, 200))

// 4. Capture state at target node
const atTarget = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "Cursor now on 'Justice' node"

// 5. Perform problematic action
await mcp__peekaboo__hotkey({ key: "j" })
await new Promise(r => setTimeout(r, 100))

// 6. Capture result
const afterJ = await mcp__peekaboo__image({ app_target: "Ghostty" })
// "Cursor jumped to top of board instead of next sibling"

// 7. Report findings
console.log("BUG: Pressing 'j' on Justice node jumps cursor to top")
console.log("Expected: Move to next sibling")
console.log("Actual: Cursor jumped to first item in board")
```

### Peekaboo Report Format

```markdown
# Peekaboo Investigation: [Issue Description]

## Environment
- **App**: Ghostty
- **Window**: [window title]
- **View mode**: [cards/list/columns/tabs]

## Steps Performed
1. [action] → [observation]
2. [action] → [observation]
...

## Screenshots
[Before screenshot with annotation]
[After screenshot with annotation]

## Findings
- **Issue confirmed**: [yes/no]
- **Description**: [what's wrong]
- **Reproduction steps**: [how to trigger]
- **Possible cause**: [hypothesis]

## Recommended Next Steps
- [ ] Create bead for this issue
- [ ] Test in TUI mode for faster iteration
- [ ] Check related code in [file]
```

### Tips for Peekaboo Mode

1. **Be patient** - Allow 100-200ms between actions for renders
2. **Capture often** - Screenshots are your evidence
3. **Describe what you see** - Help Claude understand the visual state
4. **Use search** - Navigate to specific nodes with `/` + search
5. **Try variations** - Same action in different view modes
6. **Document everything** - Findings may help diagnose later

---

## Reproducing Unreproducible Bugs

When a bug cannot be reproduced in headless testing (timing-dependent, terminal-specific, etc.):

### Step 1: Run with Debug Logging

Tell user to run:
```bash
DEBUG='km:*' DEBUG_LOG=/tmp/tui-debug.log bun km view /path/to/vault
```

This captures all debug output to a file while they use the TUI normally.

### Step 2: Reproduce the Issue

User should:
1. Navigate to the state where bug occurs
2. Perform the action that triggers the bug
3. Note what they see (blank cards, cursor jump, etc.)
4. Press `q` to exit cleanly

### Step 3: Share Debug Trace

```bash
# Full trace
cat /tmp/tui-debug.log

# Or filtered view
grep -E "render|children|card" /tmp/tui-debug.log | tail -100
```

### What to Look For

The goal is to verify the **DOM and buffer contain exactly what the database says they should** - no more, no less.

**Verification approach:**
1. Query the database for expected nodes at the current zoom level
2. Compare debug trace to see which nodes were rendered
3. Check the buffer output for the actual displayed text

```bash
# Get expected nodes from database
sqlite3 /path/to/.km/state.db "SELECT id, content FROM nodes WHERE parent_id = '<zoom-root-id>' LIMIT 20"

# Compare to debug trace
grep "TreeNode render:" /tmp/tui-debug.log | head -20

# Check buffer for actual text (if captured)
grep "CardColumn card:" /tmp/tui-debug.log
```

| Symptom | What to check |
|---------|---------------|
| Blank card | Does `TreeNode render:` show `content=(empty)` for that node? |
| Missing node | Is there a `TreeNode render:` log for that node ID at all? |
| Wrong content | Compare `content=` in log vs database `content` column |
| Extra content | Node rendered that shouldn't be at current zoom level |
| Wrong position | Check column/card indices in logs, compare to expected layout |
| Wrong size | Check if content is truncated unexpectedly, or columns misaligned |
| Wrong styling | Check task_status, selection state, dim flags in render context |

**Beyond content - also verify (depending on the bug):**
- **Relative position**: Items in correct column, correct order within column
- **Size**: Cards/columns have expected dimensions, content not clipped wrong
- **Styling**: Selection highlight, dim/bright, strikethrough, colors applied correctly

### Debug Namespaces

| Namespace | What it logs |
|-----------|--------------|
| `km:tui:render` | TreeNode rendering (new) |
| `km:tui:card-layout` | Card layout calculations |
| `km:tui:nav` | Navigation handlers |
| `km:tui:layout` | Shared component layouts |
| `km:tui:columns` | Columns view |
| `km:perf` | Performance measurements |
| `km:board` | Board state |

### Reporting Template

When user provides debug trace:
```markdown
## Debug Analysis: [Issue Description]

### Reproduction
- **Vault**: [path]
- **Action**: [what user did]
- **Visible symptom**: [blank cards, etc.]

### Debug Trace Analysis
[Paste relevant debug lines]

### Findings
- [What the trace shows]
- [Possible cause]

### Next Steps
- [ ] Add more targeted debug() calls if needed
- [ ] Create bead for the issue
- [ ] Implement fix
```

### Adding More Debug Points

If the existing debug output isn't enough, add targeted debug() calls:

```typescript
import createDebug from "debug"
const debug = createDebug("km:tui:render")

// In the component:
debug("SomeComponent: context=%o", { key: value })
```

The `debug` package is already a project dependency. All debug output goes to stderr by default, or to `DEBUG_LOG` file if that env var is set.
