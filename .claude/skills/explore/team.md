# Team-Based Exploration

**Default mode for `/explore`.** Interactive AI exploration as the main activity, with TUI tests as a background health check. Pipeline: interactive explorer discovers visual/UX issues, targeted explorer writes edge-case tests, reproducer creates beads + failing tests, fixer implements fixes — all running concurrently.

## Philosophy

**Exploration means using AI intelligence to observe, hypothesize, and investigate.** The interactive explorer launches the real TUI, looks at it, navigates, takes screenshots, and notices what feels off. Tests are a safety net (health check), not the main event.

## Lessons From Prior Sessions

These aren't optional — they're the patterns that made the difference between a session that found real bugs and one that produced noise.

### Invariant Checks > Manual Inspection

A runtime invariant that fires on every action finds bugs that manual screenshot review misses. The interactive explorer's step-6 invariant list (breadcrumb updated, no internal IDs visible, no `[object Object]`, vault unchanged after navigation, cursor on a visible node) **is the exploration**, not a checklist you skim. Each invariant caught a real bug — that's why it's there. When adding new invariants, bias toward "check on every action" instead of "check in a specific scenario."

### Real Vault > Synthetic Fixtures (But Test ON Synthetic)

**Reproduce on the real vault; write tests against synthetic fixtures.** Real data has the shapes that trigger bugs (long content, mixed node types, weird nesting); synthetic data is reproducible, small, and doesn't change between runs. The interactive explorer starts on real data (`/tmp/vt` or `--path`) to *find* the bug; the reproducer converts it into a synthetic fixture in the TUI test so the repro is stable.

Never promote a real-vault path into a test fixture — the vault will change and the test will rot. Always translate the bug shape into `item("board", ...)` form before landing it.

### Parallel Agents = Parallel Files

Background agents (explorers, reproducer, fixer) parallelize cleanly **only when they don't share files**. The pipeline below works because:
- Explorers write to `/tmp/km-explore-tests/` (scratch) and `/tmp/explore-screenshots/` (outputs)
- Reproducer writes new test files in `/tmp/km-explore-tests/`
- Fixer edits source files (one bead at a time — no two fixers on the same file)
- Only the lead touches the session bead

If two agents would edit the same file, serialize them or split the work. File-level contention is the #1 cause of "parallel agents" that actually run sequentially with extra merge pain.

### Update Beads Aggressively — They Survive Context

The session bead is the **only** thing that survives a `/compact`. Update it after every significant event:
- Bug found → append to notes, update dashboard in description
- Fix committed → append to notes with commit SHA
- User verifies → update status, update dashboard
- Blocked → append blocker and what would unblock

The dashboard is the user's only reliable window into the session — context compression can hide everything else. If the bead description isn't current, the session effectively loses memory.

## Smart Routing

The lead interprets `/explore` args to decide what to emphasize:

| Args | GUI/TTY? | TUI tests? | Example |
|------|----------------------|------------|---------|
| No args | Yes (main) | Background health check | `/explore` |
| Broad description | Yes (focused) | Background health check | `/explore recent batch ops` |
| Specific bug repro | Maybe (verify) | Yes (primary for repro) | `/explore cursor jumps after indent` |
| `--fuzz` | No | Yes (sole activity) | `/explore --fuzz` |
| `--gui` / `--gui <path>` | Yes (manual, no team) | No | `/explore --gui` |

Rule: if args describe *what to explore*, include interactive. If they describe *a specific bug to reproduce*, lead with TUI tests but verify interactively.

## Priming: What to Explore

Before spawning, the lead should gather context for agent prompts:

1. **Recent changes**: `git log --oneline -20` — recently changed code has the freshest bugs
2. **Open bug beads**: `bd list --status=open --type=bug` — known issues to validate/expand
3. **Recent recall**: `bun recall "bug"` — prior sessions may have flagged unresolved issues

Feed this context to explorer prompts. For example, if recent commits touched fold/unfold logic, tell explorers to prioritize fold/unfold scenarios.

**Default priority areas** (when no specific context):
1. Navigation (j/k/h/l) — most used, most likely to have edge cases
2. View mode transitions (v, < >) — state-heavy, interaction between systems
3. Fold/unfold (z/Z) — tree mutations that affect cursor and layout
4. Zoom (n/Shift+n) — changes the entire board context
5. Selection + batch ops (v then action) — multi-item state management
6. Dialogs (/, new item) — modal state that can conflict with navigation

## Vault Strategy

The interactive explorer uses **both** real vault AND synthetic fixtures:
1. **Start with real vault** (`--path` arg or `/tmp/vt` default) — catches real layout issues
2. **Then probe synthetic edge cases** — empty columns, deep nesting, single-item boards, wide content

If the real vault doesn't exist, fall back to synthetic only (don't fail).

## Session Bead

Create a session tracking bead **before spawning agents**:

```bash
# Generate ID: km-session.<MMDD><seq> (e.g., km-session.0215a)
bd create --id km-session.<date><seq> --type task --title "Session: <focus area>"
bd update km-session.<date><seq> --parent km-tui  # or appropriate epic
bd update km-session.<date><seq> --claim
```

The session bead is the **persistent record** of this exploration session. Its `description` is the live status dashboard (updated periodically), and `notes` is the event log (appended after each significant action).

**All agents in the session share this ONE bead.** Pass the bead ID to every agent prompt. Fixer agents update the bead notes when they fix a bug. Explorer agents update when they find a bug. This ensures a single source of truth for the session.

## Team Setup

```
TeamCreate(team_name="explore")
```

You are the **lead**. Spawn five teammates in parallel:

```
Task(team_name="...", name="health-check",          subagent_type="general-purpose", prompt="...", run_in_background=true)
Task(team_name="...", name="explorer-interactive",   subagent_type="general-purpose", prompt="...")
Task(team_name="...", name="explorer-targeted",      subagent_type="general-purpose", prompt="...")
Task(team_name="...", name="reproducer",             subagent_type="general-purpose", prompt="...")
Task(team_name="...", name="fixer",                  subagent_type="general-purpose", prompt="...")
```

Spawn all five in a single message (parallel Task calls). `health-check` runs in background.

## Roles

### 1. Lead (you)

**Coordinate, don't bottleneck.** Explorers send bugs directly to reproducer — you are not a relay.

**Hard rules:**
- Lead NEVER writes code, NEVER fixes bugs, NEVER runs tests beyond the final `bun fix && bun run test:all`. Lead is a pure dispatcher.
- When user sends `/pm` or reports a bug mid-session, create the bead AND dispatch to the fixer/reproducer within the same turn. Never defer. Never say "I'll get to that later."
- If all agents are busy: wait or spawn a new fixer. Do NOT do the work yourself.

Your job:
1. Create session bead (see [Session Bead](#session-bead) above)
2. Prime agents with `git log --oneline -20` + open bugs + args context
3. Spawn all teammates in parallel
4. Review interactive explorer's findings (screenshots + descriptions) — this is the main output
5. Monitor for user messages and route immediately — never let a user request wait
6. Update session bead incrementally:
   - `--append-notes` after each significant event (bug found, fix verified, screenshot taken)
   - `--description` after EVERY bug state transition with current status dashboard (see [reporting.md](reporting.md))
   - The dashboard is the user's only reliable window — context compression can hide everything else
7. Handle shutdown, `bun fix`, `bun run test:all`, commit + push
8. Present visual summary with screenshot paths to user at end
9. Close session bead with summary reason (see [reporting.md](reporting.md))

**Communication**: Use session shorthand numbers (#1, #2) when talking to the user. Example: `"#3 (km-tui.fold-border-blank): fix committed, awaiting TTY"`

### 2. Health Check (`health-check`) — Background

Runs tests as a safety net, reports failures only. Not exploration — just verification.

**Spawned with prompt**:
```
You are a background health checker for km TUI. Run the test suite and report ONLY failures to the lead.

Run these in sequence:
1. cd /Users/beorn/Code/pim/km && bun test:fuzz | head -400
2. TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/real-vault.test.ts 2>&1 | head -200
   (skip if /tmp/vt doesn't exist)
3. bun vitest run apps/km-tui/tests/ --reporter=verbose 2>&1 | head -300

If ALL tests pass: message the lead "Health check passed — no regressions found" with a count of tests run.

If ANY test fails: message the lead immediately with failure details:
  "HEALTH CHECK FAILURE: [test name] — [error summary]"
  Include the full error output.

Also try varying fuzz seeds:
  FUZZ_SEED=42 bun test:fuzz | head -200
  FUZZ_SEED=999 bun test:fuzz | head -200

DO NOT write new test files. DO NOT fix bugs. DO NOT run bun fix.
```

### 3. Explorer — Interactive (`explorer-interactive`) — PRIMARY

**The main exploration agent.** Launches the TUI via TTY MCP, navigates intelligently, takes screenshots, reports visual/UX issues.

**Spawned with prompt** (include primed context from git log + open bugs):
```
You are an interactive TUI explorer for km. Your job is to LAUNCH the real TUI, LOOK at it, NAVIGATE through it, and NOTICE what feels off. You are the AI's eyes — observe, hypothesize, investigate.

## Phase 1: Real vault exploration

1. Create screenshot directory:
   Bash: mkdir -p /tmp/explore-screenshots

2. Launch TUI with real vault:
   mcp__tty__start(command=["bun", "km", "view", "<vault-path>"], cols=120, rows=40, cwd="/Users/beorn/Code/pim/km")
   (Use /tmp/vt if no --path specified. If it doesn't exist, skip to Phase 2.)

3. Screenshot on startup — save to /tmp/explore-screenshots/01-startup.png

4. Navigate to areas related to recent changes:
   [LEAD INSERTS: recent git changes and open bugs context here]

5. For each area, do NORMAL usage first, then edge cases:
   - Press keys naturally: j/k to navigate, l to enter, h to go back
   - Take screenshots at INTERESTING states (not mechanically)
   - Use mcp__tty__text to cross-check what's rendered
   - THINK: Does this look right? Is the layout balanced? Any visual artifacts?
   - Pay attention to: alignment, colors, blank areas, truncation, cursor position

6. INVARIANT CHECKS after every action:
   - Breadcrumb updated? (text output should show new cursor target)
   - No internal IDs visible? (no 8-char hex strings like "XWJE24KP")
   - No "[object Object]" or "TypeError" or "NaN" in output?
   - After NAVIGATION keys (j/k/h/l): vault files unchanged? (md5sum the vault dir)
   - After EDIT operations: content saved correctly? (check file)
   - Cursor on a visible node? (data-cursor attribute exists in output)

6. Try these interactions:
   - Fold/unfold (z/Z) — does the layout reflow cleanly?
   - View mode switch (v) — do cards ↔ list transitions look right?
   - Outline depth (< >) — any blank cards or misalignment?
   - Search (/) — does the overlay render correctly?
   - Scroll through long lists — any flickering or blank areas?

## Phase 2: Synthetic edge cases

Stop real vault session (mcp__tty__stop).

Create a synthetic vault with edge cases:
  Bash: mkdir -p /tmp/explore-synthetic/col-empty /tmp/explore-synthetic/col-one && echo "# Single" > /tmp/explore-synthetic/col-one/task.md && mkdir -p /tmp/explore-synthetic/col-deep/a/b/c/d/e && echo "# Deep" > /tmp/explore-synthetic/col-deep/a/b/c/d/e/leaf.md && for i in $(seq 1 30); do echo "# Task $i" > "/tmp/explore-synthetic/col-one/task-$i.md"; done

Launch TUI on synthetic vault:
  mcp__tty__start(command=["bun", "km", "view", "/tmp/explore-synthetic"], cols=120, rows=40, cwd="/Users/beorn/Code/pim/km")

Test: empty columns, single item, very deep nesting, long scrollable lists, many columns.
Screenshot interesting states.

## Phase 3: Narrow terminal

Stop, restart at 80x24:
  mcp__tty__start(command=["bun", "km", "view", "<vault-path>"], cols=80, rows=24, cwd="/Users/beorn/Code/pim/km")

Quick pass through key areas — does layout degrade gracefully?
Screenshot any layout breakage.

## Budgets
- ~100 actions total across all phases
- 8-12 screenshots (quality over quantity)
- 2+ terminal sizes

## Reporting visual issues

When you spot something off, send to reproducer:

VISUAL BUG: [description]
Terminal size: [cols]x[rows]
Key sequence from startup: [every key pressed in order]
Expected: [what should appear]
Actual: [what appears]
Text output: [mcp__tty__text result, relevant section]
Screenshot: /tmp/explore-screenshots/NN-name.png

When you're done with all phases, message the lead with:
- Summary of areas explored
- List of screenshots taken (with paths)
- Visual issues found (with descriptions)
- Overall impression of TUI quality

DO NOT write test files. DO NOT fix bugs. DO NOT run bun fix or bun run test:all.
```

### 4. Explorer — Targeted (`explorer-targeted`)

**Secondary explorer.** Writes TUI tests for edge cases, follows up on issues the interactive explorer spots.

**Spawned with prompt**:
```
You are a targeted explorer for km TUI. Your job is to find bugs by writing and running custom exploration scripts. Send bugs directly to reproducer.

Write scripts in /tmp/km-explore-tests/ using testEnv() + item() from apps/km-tui/tests/helpers/board-test.ts.
IMPORTANT: NEVER write explore tests to apps/km-tui/tests/ — use /tmp/ to avoid polluting the test suite.

  Bash: mkdir -p /tmp/km-explore-tests

Explore these areas (write a separate script for each, run immediately):
- Navigation edge cases: deep nesting, single-item columns, empty columns
- View mode transitions: list ↔ cards, outline depth changes (< >), zoom in/out (n/Shift+n)
- Dialog interactions: search (/), new item, move mode, then navigate
- Selection: select multiple (v), then fold/unfold/move/delete
- Fold/unfold (z/Z) combined with navigation
- Cursor at boundaries: first item, last item, first column, last column

Script template (in /tmp/km-explore-tests/):
  import { describe, test, expect } from "vitest"
  import { testEnv, item } from "../../apps/km-tui/tests/helpers/board-test.ts"

  describe("Exploration: [area]", () => {
    test("[description]", () => {
      const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
      const bugs: string[] = []
      // exercise actions, check for cursor existence, rendering garbage, throws
      board.press("j")
      const text = board.textContent()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push("garbage in output after j")
      }
      expect(bugs).toEqual([])
    })
  })

Run each script: bun vitest run /tmp/km-explore-tests/<file>

When you find a bug, send to reproducer immediately:
  SendMessage(recipient="reproducer", content="BUG: [description]\nKey sequence: [...]\nFixture: item(...)\nError: [message]")

Also handle requests from explorer-interactive — if the interactive explorer spots a visual issue, write a TUI test to confirm it.

STOPPING RULE:
- Minimum: cover all 6 areas above with at least one script each
- After minimums met: keep writing new variations until 100+ test interactions pass without finding a new bug
- If you find a bug, the counter resets — write more variations in that area
- When converged, message the lead with a summary: areas covered, scripts written, bugs found, total interactions

DO NOT fix bugs. DO NOT run bun fix or bun run test:all.
```

### 5. Reproducer

**Spawned with prompt**:
```
You are a bug reproducer for km TUI. You receive bugs from multiple explorers (interactive and targeted) — handle them as fast as they arrive.

DEDUP FIRST: Before creating a bead, check for existing matches:
  cd /Users/beorn/Code/pim/km && bd list --status=open | grep -i "keyword"
Match on the core symptom, not exact wording. If a match exists, message the explorer that it's a known issue and skip it.

When ANY teammate sends a bug (or batch of bugs):

For EACH unique bug:
1. Create a bead:
   cd /Users/beorn/Code/pim/km && bd create --type=bug --priority=2 --title="TUI: [description]"
   bd update <id> --parent km-tui
   bd update <id> --claim

2. Write a FAILING TUI test:
   File: /tmp/km-explore-tests/<descriptive-name>.test.ts
   Use testEnv() + item() (import from ../../apps/km-tui/tests/helpers/board-test.ts)
   The test MUST FAIL — it documents the bug
   NEVER write to apps/km-tui/tests/ — explore tests go in /tmp/

   For VISUAL BUG reports from explorer-interactive:
   - Reconstruct the key sequence in a TUI test
   - Use board.textContent() to verify the visual issue
   - If the bug is purely visual (pixel-level) and can't be caught in a TUI test, note this in the bead

3. Confirm it fails: bun vitest run /tmp/km-explore-tests/<test-file>

4. Send bead ID + test path to fixer IMMEDIATELY — don't batch, send as each one is ready

DO NOT fix bugs. DO NOT run bun fix or bun run test:all.
When idle, message the lead asking for more work.
```

### 6. Fixer

**Spawned with prompt**:
```
You are a bug fixer for km TUI. You handle multiple fixes — work on the next bug as soon as you finish the current one.

When the reproducer sends a failing test, follow the FULL bug lifecycle:

### Step 1: /tdd — Reproduce First
1. Read the failing test to understand the bug
2. Run it — confirm it fails for the right reason
3. If no failing test from reproducer: write one yourself BEFORE reading source code

### Step 2: Fix
4. Investigate root cause in source
5. Implement minimal fix
6. Confirm test passes: bun vitest run <test-file>
7. Check regressions:
   bun vitest run apps/km-tui/tests/ --reporter=verbose 2>&1 | head -300

### Step 3: /why — Root Cause Analysis
8. After fixing, ask: WHY did this bug exist? Trace the causal chain (2-3 levels):
   - Why 1: What directly caused it?
   - Why 2: What design allowed it?
   - Why 3: What's missing that would prevent the whole class?
   Add the /why analysis to the bead notes: bd update <id> --append-notes "Why: ..."

### Step 4: /big — Is There a Simpler Way? (conditional)
9. If the /why reveals a PATTERN (same class of bug appeared before, or the fix feels like duct tape):
   - Check bun recall for similar past bugs
   - If 3+ bugs share a root cause: note the structural fix in the bead
   - Don't implement the structural fix — just document it for future planning

### Step 5: Verify + Close
10. **For rendering/visual bugs**: **You MUST follow** the [three-layer verification protocol](../tui/fix.md#three-layer-verification) —
   use mcp_tty tools (ToolSearch "tty" first) for GUI/TTY verification + calibrate the regression test.
   Pure logic bugs can skip GUI/TTY — state "Verified: TUI tests only" in close reason.
11. Close bead using the [structured close reason format](../pm/workflows/bugs.md#close-reason-template) — **read it for the mandatory format**.
12. Notify lead that fix is done, then immediately pick up next bug

HARD GATE: Never call `bd close` on a visual/rendering bug.
After TUI test passes + GUI/TTY verification:
  bd update <id> --append-notes "Layer 1+2 done. Awaiting user confirmation."
Message the lead: "#N (<bead-id>) ready for user verification."
Only the LEAD closes visual bugs, and only after user confirms.

TUI TEST ACCURACY: For every visual bug fix, use withDiagnostics with
checkReplay: true and checkIncremental: true. Test with realistic data
(5+ columns, long content, mixed node types), not minimal 2-column fixtures.
Test multi-step sequences (7+ operations), not single actions. These catches
make Layer 1 (TUI test) reliable enough that Layer 2 (TTY) becomes a
spot-check, not a crutch.

DO NOT run bun fix or bun run test:all — lead handles that.

Architecture:
- Board actions: apps/km-tui/src/board/board-actions.ts
- Board state: apps/km-tui/src/state.ts
- Keyboard ops: apps/km-tui/src/keyboard/keyboard-card-ops.ts
- Column view: apps/km-tui/src/views/CardColumn.tsx
- Board view: apps/km-tui/src/views/Board.tsx
- Layout hooks: apps/km-tui/src/hooks/use-columns.ts
- Storage sync: packages/km-storage/src/watch/
```

## Flow

```
health-check (background) ─── test suite, reports regressions only

explorer-interactive ────(visual bugs)───┐
                                          ├──> reproducer ──(tests)──> fixer
explorer-targeted ───────(test bugs)─────┘     (dedup)                   │
                                                                          │
lead (reviews screenshots, coordinates)                                   │
    └──────────────(fix done, collect screenshots)────────────────────────┘
```

All agents run concurrently from the start. Explorers send bugs directly to reproducer. Reproducer deduplicates before creating beads. Health check runs in background — reports only failures.

## TTY MCP Failure Protocol

If ANY agent reports TTY MCP tools unavailable/hanging/erroring:

1. Lead STOPS ALL WORK immediately.
2. Lead broadcasts: "TTY tools unavailable. All work paused."
3. Lead messages user: "TTY MCP tools not working. Cannot do visual verification. Please run `/mcp` to reconnect, then tell me to resume."
4. NO bugs fixed, closed, or verified while TTY is down. Pipeline frozen.

**Rationale**: Without Layer 2 (GUI/TTY), every visual fix is unverifiable. Continuing produces beads that will be reopened.

## Bounds

Explorers stop when they've **exhausted their ability to find new bugs**, not after a fixed scope:

- **Convergence rule**: An explorer is done when it has run **100+ test interactions** (or ~100 TTY actions for interactive) without discovering a new bug since the last one.
- **Minimum coverage**: Before convergence, explorer-interactive must complete all 3 phases (real vault + synthetic + narrow terminal), and explorer-targeted must cover all 6 priority areas.
- **Bug burst reset**: When a bug is found, the counter resets. If bugs cluster in one area, keep digging.
- **Overall**: Lead initiates shutdown when both explorers report convergence and the reproducer/fixer pipeline is drained.

## Stopping Criteria

**Precondition**: Before initiating shutdown, check: are there bugs in `Awaiting user`, `Fix in progress`, or `Investigating` state? If yes, do NOT shut down. Continue the pipeline.

The session is complete when ALL discovered bugs are in a terminal state: `Fixed` (user confirmed), `Deferred` (user said don't fix), or `Blocked` (documented why).

If running low on context/tokens: checkpoint the session bead with full status, tell the user "I need a fresh session to continue. Here is the current state. Run /explore to resume." Do NOT close bugs that aren't finished.

Exploration ends when:
- Both explorers report convergence (minimums met + 100+ interactions without a new bug)
- Reproducer and fixer have processed all queued bugs
- All bugs are in a terminal state (Fixed/Deferred/Blocked)
- OR lead decides to stop early (e.g., enough bugs found, time constraints) — but still checkpoints incomplete work

**If zero bugs are found**: That's a good result. Lead writes a summary of what was tested (areas, screenshots, interactions) and shuts down. No beads needed.

## Shutdown

1. Wait for explorers to report completion
2. Wait for reproducer + fixer to drain their queues
3. Send shutdown to all teammates
4. Promote valuable tests: if any /tmp/km-explore-tests/ tests catch real bugs, merge the test cases into the appropriate EXISTING test file in apps/km-tui/tests/ (don't copy the whole file — just the relevant test case)
5. Clean up: rm -rf /tmp/km-explore-tests/
6. Collect screenshots from `/tmp/explore-screenshots/` — present gallery to user
7. Run `bun fix && bun run test:all` from lead
7.5. Write the mandatory retrospective (see [reporting.md](reporting.md) § Session Retrospective).
     Use `bun recall` and `bd search` to find prior mentions of each bug.
     Append to session bead notes with `bd update <session-id> --append-notes`.
8. Verify every row in the dashboard table is in a terminal state. If any bug is mid-pipeline, the session is not done.
9. Update session bead description with final dashboard + close with summary (see [reporting.md](reporting.md))
   Close reason must enumerate incomplete work:
   `"Session complete. N fixed, M deferred. Remaining: #3 (km-tui.X) awaiting user verification, #7 (km-tui.Y) root cause found but fix not landed."`
10. Commit + push
11. `TeamDelete()`
