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

### 3. TUI Design System

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

### 4. Code Structure Style

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

### 5. Test-Driven Development

**Test commands:**

```bash
bun run test:fast    # ⚡ USE THIS for fast iteration (~4s)
bun run test:all     # ALL tests - unit + mdtest (~2min, run before committing)
bun run test:mdtest  # Only mdtest integration tests (*.test.md)
```

**⚠️ NEVER use bare `bun test`** - it picks up archived tests in `archive/` and takes forever. Always use the npm scripts above.

**⚡ IMPORTANT: Use `bun run test:fast` during development!**

- `test:fast` takes ~4 seconds - use this while iterating
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

### 6. New Package Checklist (MUST FOLLOW)

When creating a new package under `packages/`:

**Before Merging:**

1. **Tests exist** - At minimum, test public API functions. No package ships with 0 tests.
2. **Exports are minimal** - Only export what consumers need. Don't export internal helpers.
3. **No duplicate utilities** - Check if `fuzzyMatch`, `formatDate`, etc. already exist in `@km/core`.
4. **Types match docs** - If you write documentation with interfaces, verify impl matches exactly.
5. **No TODO comments in production paths** - `// TODO: wire this up` means it's not done.

**Quality Bar:**

- Every public function has at least one test
- Type definitions in docs match actual types (run `tsc` to verify)
- No hardcoded placeholder values (e.g., `inMoveMode: false // TODO`)

### 7. Documentation Hygiene

**Write docs AFTER implementation, not before:**

- Speculative documentation drifts from reality
- Write docs by reading the actual code, not from memory
- If you update an interface, grep for doc references and update them

**When docs exist:**

- Before modifying a type, check if it's documented (grep for type name in `docs/`)
- After modifying, update docs in the SAME commit
- If docs and code disagree, code is truth - update docs to match

**For detailed testing guidance**, see [docs/dev/testing.md](docs/dev/testing.md):

- Which test type to use for each layer
- How to use `km sh` + `mdtest` for TUI behavior tests
- Coverage goals per layer

---

### 8. Beads Issue Tracking

This project uses [beads](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

```bash
bd ready              # Find available work (no blockers)
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd create --title="..." --type=task --priority=2
bd sync               # Commit beads changes
```

**Workflow:** `bd ready` → claim → work → `bd close` → `bd sync`

**Key concepts:**

- Priority: P0=critical, P1=high, P2=medium, P3=low, P4=backlog
- Types: task, bug, feature, epic, question, docs
- Dependencies: `bd dep add <issue> <depends-on>`

---

### 9. Session Completion (MANDATORY)

**When ending a session**, complete ALL steps. Work is NOT complete until `git push` succeeds.

```bash
# 1. File issues for remaining work
bd create --title="..." --type=task

# 2. Run quality gates (if code changed)
bun fix && bun run test:all

# 3. Update issue status
bd close <id>

# 4. Push to remote (MANDATORY)
git pull --rebase && bd sync && git push
git status  # MUST show "up to date with origin"
```

**CRITICAL:** NEVER stop before pushing. If push fails, resolve and retry.

---

### 10. Visual Testing

Use headless methods (ttyd + Playwright) by default. See [.claude/skills/visual-test.md](.claude/skills/visual-test.md) for full documentation.

```bash
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault @next.md &
sleep 3
HEADLESS=true bun x playwright screenshot --viewport-size=1400,900 http://localhost:7681 /tmp/tui.png
```

**Peekaboo (desktop capture):** ALWAYS use AskUserQuestion to get explicit approval BEFORE using Peekaboo MCP tools.

**Visual Bug Fixing:** You CANNOT fix what you cannot see. BEFORE attempting any fix:

1. Reproduce the bug visually (screenshot showing the issue)
2. If you can't reproduce, ask user for help - DO NOT guess at fixes
3. After fix, capture AFTER screenshot and compare
4. For recurring bugs, wait for user confirmation before closing
