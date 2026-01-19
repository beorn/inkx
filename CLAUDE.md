# Agent Instructions

## Architectural Rules (MUST FOLLOW)

Before writing ANY code, you MUST understand and follow these rules. See [docs/README.md](docs/README.md) for full details.

### 1. Clear Layering

```
App Layer (apps/)     → Board Layer (@km/board)
                      → Tree Layer (@km/tree)
                      → Storage Layer (@km/storage)
                      → Parser Layer (@km/markdown)
                      → Filesystem (markdown files)
```

- Each layer only calls the layer directly below it
- UI never touches filesystem directly
- Model changes MUST propagate to filesystem (bidirectional)

### 2. Bidirectional Sync

ALL task edits MUST flow both directions:

- TUI edit → Model → File
- File edit → Model → TUI re-render

### 4. TUI Design System

When modifying TUI styling (colors, selection states, visual hierarchy), you MUST consult [docs/08-ui.md](docs/08-ui.md). Key rules:

- **Selection**: `cyan` background + `black` foreground (NEVER blue/white)
- **Reserved colors**: `cyan` bg = selection only, `inverse` = input cursor only
- **Headers**: `yellow` (selected) / `yellowBright` + dim (unselected)
- **Status icons**: Use both color AND shape (colorblind-safe)

**Ink Framework Patterns**: When working on TUI code using Ink, you MUST read [docs/dev/ink-patterns.md](docs/dev/ink-patterns.md). This documents critical workarounds for Ink's layout limitations including:

- Fullscreen initialization race condition (50ms delay fix)
- Manual width management and constraint propagation
- ANSI-aware text length calculations
- Text truncation and wrapping patterns

### 5. Code Structure Style

**Important logic first, details later.**

#### File Layout

1. Imports
2. Exports / re-exports
3. **Main components/functions** (core logic)
4. Helper functions (pure utilities)
5. Constants/config

#### Function Layout

- Main logic at top, helpers after `return` (hoisting makes this work)
- Pure functions that don't need closure → move to module level
- Functions needing closure but not part of main flow → after return statement

```tsx
function Component() {
  useEffect(handleRefresh, []);
  useInput(handleKeyboardInput);

  return <Box>...</Box>;

  // Hoisted helpers (need closure access)
  function handleRefresh() {
    /* ... */
  }
  function handleKeyboardInput(input: string, key: Key) {
    /* ... */
  }
}

// Pure helpers at module level
function formatDate(d: Date): string {
  /* ... */
}
```

**Short lambdas (1-3 lines) are fine inline:**

```tsx
useEffect(() => dispatch(setRootId(id)), [id]);
const doubled = items.map((x) => x * 2);
```

### 6. Test-Driven Development

**Test commands:**

```bash
bun run test:fast    # ⚡ USE THIS for fast iteration (~4s)
bun test             # All unit tests including slow (~45s)
bun run test:all     # ALL tests - unit + mdtest (~2min, run before committing)
bun run test:mdtest  # Only mdtest integration tests (*.test.md)
```

**⚡ IMPORTANT: Use `bun run test:fast` during development!**

- `test:fast` takes ~4 seconds - use this while iterating
- `bun test` takes ~45 seconds - includes slow integration tests
- Only run `test:all` before committing

**BEFORE committing any code changes:**

```bash
bun fix              # MUST pass - auto-fix lint + format
bun run test:all     # MUST pass - all tests including mdtest
```

**During development:**

```bash
bun run test:fast    # Run this frequently - 4 second feedback loop
```

**When implementing features:**

1. Write acceptance test first (should fail)
2. Implement feature
3. `bun run test:fast` passes (iterate here!)
4. `bun fix` passes
5. `bun run test:all` passes (final check before commit)
6. Commit

**For detailed testing guidance**, see [docs/dev/testing.md](docs/dev/testing.md):

- Which test type to use for each layer
- How to use `km sh` + `mdtest` for TUI behavior tests
- Coverage goals per layer

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

## Visual Testing

**Default: Use headless methods** (ttyd + Playwright) for TUI/CLI visual testing. These run in the background without taking over the user's screen.

```bash
# Start TUI in headless terminal
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault @next.md &
sleep 3

# Capture with Playwright (HEADLESS=true prevents browser window)
HEADLESS=true bun x playwright screenshot --viewport-size=1400,900 http://localhost:7681 /tmp/tui.png

# View the screenshot
# Use Read tool on /tmp/tui.png
```

See `.claude/skills/visual-test.md` for full documentation.

**Desktop capture (Peekaboo)**: ALWAYS use AskUserQuestion to get explicit approval BEFORE using any Peekaboo MCP tools. The user must confirm they are ready since Peekaboo takes over their screen. Never assume you can use Peekaboo without asking first, even if the user previously mentioned desktop capture.

### Visual Bug Fixing Process (MANDATORY)

**CRITICAL: Do NOT close visual bugs without completing ALL steps below.**

Visual bugs have been incorrectly marked as fixed multiple times. Follow this strict process:

#### 1. Reproduce the Bug First
```bash
# Create/use test data that EXERCISES the specific bug
# For layout bugs: need data that overflows, has multi-line items, etc.
# CAPTURE BEFORE screenshot showing the bug exists
```

#### 2. Create Proper Test Data
For TUI layout bugs, test data MUST include:
- **Vertical overflow**: Enough items to exceed screen height
- **Multi-line items**: Long text that wraps, items with children
- **Edge cases**: Empty columns, very long text, nested structures

Example multi-line test data:
```markdown
## Processing
- [ ] Task with a very long description that will definitely wrap to multiple lines in any reasonable terminal width
  - Subtask that adds more lines
  - Another subtask for good measure
- [ ] Second task also with long content to ensure wrapping behavior is tested properly
```

#### 3. Capture BEFORE Screenshot
```bash
# MUST capture and view screenshot BEFORE attempting fix
ttyd -W -p 7681 bun km view -r /tmp/test-repo @test-board.md &
sleep 5
# Navigate to problematic view
bun x playwright screenshot http://localhost:7681 /tmp/bug-BEFORE.png
# READ the screenshot to verify bug is visible
```

#### 4. Implement Fix

#### 5. Capture AFTER Screenshot
```bash
# MUST capture and view screenshot AFTER fix
bun x playwright screenshot http://localhost:7681 /tmp/bug-AFTER.png
# READ the screenshot to verify bug is fixed
```

#### 6. Verify Fix is Real
- Compare BEFORE and AFTER screenshots
- Bug must be visibly fixed in AFTER screenshot
- If uncertain, DO NOT close the bug

#### 7. Request User Confirmation
For recurring bugs (reported multiple times):
- Do NOT close until user explicitly confirms fix
- Show user the AFTER screenshot
- Wait for user approval before closing bead

**NEVER assume a visual bug is fixed without visual verification.**
