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

When modifying TUI styling, see [.claude/skills/tui-design.md](.claude/skills/tui-design.md) for patterns and [docs/06-ui.md](docs/06-ui.md) for the full spec.

**Critical rules:**

- **Selection**: `cyan` bg + `black` fg (NEVER blue/white)
- **Status icons**: Color AND shape (colorblind-safe)
- **Background colors**: Use inkx `backgroundColor` OR chalk.bg\*, never both

**Ink Framework**: See [docs/dev/ink-patterns.md](docs/dev/ink-patterns.md) for critical workarounds (fullscreen race, width management, ANSI-aware text)

### 4. Code Structure Style

**Important logic first, details later.** Main flow at top of file/function, helpers after return. Use JavaScript hoisting to your advantage.

See [docs/00-principles.md](docs/00-principles.md) §9 for the full pattern with examples.

#### ESM Only - No require()

**NEVER use `require()`.** This is a Bun/ESM codebase. Always use ES module imports:

```typescript
// ❌ BAD - CommonJS require
const fs = require("fs")
const { readFileSync } = require("fs")

// ✅ GOOD - ES module import
import fs from "fs"
import { readFileSync } from "fs"
```

This applies to all code including:

- Dynamic imports (use `await import()` not `require()`)
- JSON files (use `import data from "./data.json"`)
- Optional dependencies (use try/catch with `await import()`)

#### Prefer Type Inference

**Let TypeScript infer types when possible.** Only add explicit type annotations when:

1. **Interface/type definitions** - properties must have explicit types
2. **Exported function parameters** - for API clarity and documentation
3. **Complex return types** - when inference would be unclear or wrong

```typescript
// ✅ GOOD - inference works
const items = nodes.map((n) => n.id);
const count = items.length;
const result = await loadRepo(path);

// ✅ GOOD - explicit type needed (exported API)
export function buildBoardState(repo: Repo, rootId: string): BoardState {

// ✅ GOOD - explicit type needed (interface)
interface Context {
  repo: Repo;
}

// ❌ BAD - unnecessary type annotation
const items: string[] = nodes.map((n) => n.id);
const count: number = items.length;
```

### 5. Test-Driven Development

**Test commands:**

```bash
bun run test:fast    # ⚡ USE THIS for fast iteration (<5s target)
bun run test:all     # ALL tests - unit + mdtest (~2min, run before committing)
```

**⚠️ NEVER use bare `bun test`** - it picks up archived tests in `archive/` and takes forever. Always use the package.json scripts above.

**During development:**

```bash
bun run test:fast    # Run this frequently - <5 second feedback loop (do NOT run test:all - it's slow)
bun lint | tail -100         # see lint warnings & errors
bun lint:errors | tail -100  # see lint errors only
```

- If test:fast takes longer than 5 seconds, schedule a cleanup/pruning/optimization round.
- Move slow integration tests to `*.slow.test.ts` suffix to exclude them from test:fast.
- Do NOT `bun run test:all` while iterating as it's slow.

**BEFORE committing any code changes:**

```bash
bun fix              # MUST pass - auto-fix lint + format
bun run test:all     # MUST pass - all tests including mdtest
bun run test:mdtest  # Only mdtest integration tests (*.test.md)
```

**When implementing features:**

1. Write tests first (should fail)
2. Implement feature
3. `bun run test:fast` passes (iterate here!)
4. `bun fix` passes
5. `bun run test:all` passes (final check before commit)
6. Commit

**Spec Tests (.spec.ts / .test.md):**

- Acceptance tests that serve as executable requirements (AC)
- Operate at UI/outermost level - test behavior, check visual results
- TUI: board.spec.ts (CSS selectors + boundingBox + interactions)
- CLI: km-<command>.test.md files (e.g., km-view.test.md, km-sync.test.md)
- Use full command system (stdin.write for TUI, shell for CLI)
- **Recommended**: Run with `bun run test:mock` for fastest iteration (~20s)

**⚠️ CRITICAL: Test Safety - Use Isolated Test Directories**

- `km sync --to-fs` once corrupted source files by converting them to markdown stubs
- Tests use `/tmp/kmtest-*` directories that are created and destroyed per test
- Never run sync operations or tests on directories you care about (e.g., the km source code repo, user repos with real data)
- Any sync operation that writes to filesystem must be tested in isolation
- E2E tests in `packages/km-storage/tests/e2e/` verify sync never touches non-.md files
- Manual testing should use throw-away test repos:

  ```bash
  # Create a test repo
  rm -rf /tmp/test-repo && mkdir -p /tmp/test-repo
  echo -e "# Test\n- [ ] Task 1" > /tmp/test-repo/test.md
  bun km view /tmp/test-repo
  ```

### 6. New Package Checklist (MUST FOLLOW)

When creating a new package under `packages/`:

**Vendor Packages (`vendor/`):**

Packages in `vendor/` are standalone libraries that could be useful outside km. When creating a new vendor package:

1. **Create as git submodule** - Never commit vendor code directly to km
2. **Create public GitHub repo** - `gh repo create beorn/<name> --public`
3. **Add as submodule** - `git submodule add git@github.com:beorn/<name>.git vendor/beorn-<name>`
4. **Push both repos** - Push the new repo, then commit the submodule reference in km

**Fixing and Extending Vendor Packages:**

**We don't have to live with vendor packages' limitations.** If a vendor package (like inkx, flexx, or any other submodule) is missing functionality we need:

1. **Fix it directly in the submodule** - Navigate to `vendor/<name>`, make changes, commit
2. **Push to the submodule repo** - `cd vendor/<name> && git push`
3. **Update the reference in km** - `git add vendor/<name> && git commit -m "chore(vendor): update <name> with fix"`

Examples:

- Missing `.text()` method on InkxLocator → add it to inkx
- Need better layout constraints in flexx → fix flexx directly
- Vendor package has bugs → patch them in the submodule

Don't work around limitations by duplicating functionality or creating wrapper abstractions. Fix the root cause in the vendor package and push the improvement upstream.

**Internal Packages (`packages/`):**

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
- If you update an interface, search for doc references and update them (`rg "TypeName" docs/`)

**When docs exist:**

- Before modifying a type, check if it's documented (`rg "TypeName" docs/`)
- After modifying, update docs in the SAME commit
- If docs and code disagree, code is truth - update docs to match

**For detailed testing guidance**, see [docs/dev/testing.md](docs/dev/testing.md):

- Which test type to use for each layer
- How to use `km sh` + `mdtest` for TUI behavior tests
- Coverage goals per layer

**Chaos testing for sync bugs:** Use `/chaos-test` to discover and fix file synchronization bugs. This runs a property-based fuzzer that simulates edge cases like dropped events, reordering, and race conditions. See [docs/dev/chaos-testing.md](docs/dev/chaos-testing.md) for details.

**Documentation Self-Improvement:**

When you run a command incorrectly (wrong flags, wrong field names, unexpected output), **immediately update the relevant documentation** with correct usage. This applies to:

- Skill files (`.claude/skills/*/SKILL.md`) - for slash commands like `/bd`, `/commit`
- CLAUDE.md - for project-wide commands and patterns
- docs/ files - for detailed guides

Examples of when to update:

- You use `jq '.title'` but the actual field is `.id` → document correct field name
- You try `--filter` but the flag is `--title` → document the correct flag
- A command has options you discover → add them to the docs
- Output format differs from expected → document actual format

Don't just fix your command and move on — fix the docs so next time you (or another session) get it right immediately.

---

### 8. Beads Issue Tracking

This project uses [beads](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

**When user mentions beads, bd, or issue tracking → use `/bd` command.**

| Context     | Command        | Notes                                     |
| ----------- | -------------- | ----------------------------------------- |
| Claude Code | `/bd <action>` | Slash command (invokes bd CLI internally) |
| Bash        | `bd <action>`  | Direct CLI usage                          |

**Run `/bd` for the full command reference.**

**Key rules:**

- **ALWAYS** use `/bd work <id>` before starting work (claims the bead for your session)
- **ALWAYS** close beads immediately when done (`/bd close <id>`)
- **NEVER** edit `.beads/` files directly — always use `bd` commands
- **NEVER** use bare `bd update --status in_progress` — it breaks session coordination

**Common operations:**

```bash
/bd list              # Show open beads
/bd work <id>         # Claim and start working
/bd show <id>         # View bead details
/bd close <id>        # Mark complete
bd sync               # Sync beads with git (in Bash)
```

**⚠️ Do NOT use `bun km bd` or `km bd`** - not ready yet. Use `/bd` or `bd` directly.

---

### 9. Conventional Commits

All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature (maps to CHANGELOG "Added")
- `fix`: Bug fix (maps to CHANGELOG "Fixed")
- `refactor`: Code change that neither fixes a bug nor adds a feature (maps to "Changed")
- `docs`: Documentation only
- `test`: Adding or updating tests
- `chore`: Maintenance (deps, build, CI)
- `perf`: Performance improvement
- `style`: Formatting, whitespace (no code change)

**Scopes** (optional, use package name or area):

- `storage`, `tree`, `board`, `markdown`, `query`, `cli`, `tui`
- `beads`, `inkx`, `docs`

**Examples:**

```bash
feat(storage): add file watcher debouncing
fix(tui): resolve blank screen on startup
refactor(board): simplify column selection logic
docs: update architecture diagram
chore(deps): bump inkx to 0.3.0
```

**Breaking changes:** Add `!` after type or `BREAKING CHANGE:` in footer:

```bash
feat(query)!: change filter syntax to use colon separator
```

**Beads reference:** Include issue ID in footer when applicable:

```bash
fix(tui): preserve cursor on zoom

Resolves: km-k5k3
```

---

### 10. Session Completion (MANDATORY)

**When ending a session**, complete ALL steps. Work is NOT complete until `git push` succeeds.

```bash
# 1. Update CHANGELOG.md [Unreleased] section (if code changed)
# Categories: Added, Changed, Fixed, Removed

# 2. File issues for remaining work
bd create --title="..." --type=task

# 3. Run quality gates (if code changed)
bun fix && bun run test:all

# 4. Update issue status
bd close <id>

# 5. Push to remote (MANDATORY)
git pull --rebase && bd sync && git push
git status  # MUST show "up to date with origin"
```

**CRITICAL:** NEVER stop before pushing. If push fails, resolve and retry.

**Propose next steps when stopping.** Before ending a session, offer the user clear options for what to do next. Use `AskUserQuestion` with 2-4 actionable choices like:

- Continue with next highest priority bead
- Run tests/quality gates
- Commit and push current work
- Review a specific file or feature

This makes it easy for the user to say "yes" or pick an option rather than having to think about what's next.

---

### 11. Bug Reports

When a user reports a bug, follow [.claude/skills/bug-report.md](.claude/skills/bug-report.md). Key rules:

1. **Create bead immediately** - `bd create --type=bug` so nothing gets lost
2. **Reproduce before fixing** - You must SEE the bug before attempting fixes
3. **Write failing test** - Proves understanding, prevents regression
4. **Verify with evidence** - Tests pass + visual confirmation for TUI bugs
5. **User confirms closure** - For non-trivial bugs, user decides when done

**Never claim "fixed" without verification. Never close a bug bead without evidence.**

### 12. Logging

km has two logging systems. See [.claude/skills/logging.md](.claude/skills/logging.md) for full patterns.

| System    | Purpose            | When to use                                             |
| --------- | ------------------ | ------------------------------------------------------- |
| `debug()` | Internal tracing   | State dumps, performance timing, internal diagnostics   |
| `logger`  | User-facing output | Progress messages, errors, warnings the user should see |

**Quick reference:**

```typescript
import createDebug from "debug"
const debug = createDebug("km:storage:watch")

import { createLogger } from "@km/core"
const logger = createLogger("@km/storage")
```

**TUI debugging:** `DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view ...`

**Worker threads:** MUST forward debug output to main thread via `postMessage()`. See logging skill for mandatory pattern.

### 13. Visual Testing & TUI Debugging

**Preferred method: DEBUG_LOG + Visual Inspection**

For debugging TUI issues, combine debug logging with visual inspection to see both what the code is doing AND how it renders:

```bash
# Terminal 1: Run TUI with debug logging to file
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/repo

# Terminal 2: Watch the debug log
tail -f /tmp/km.log
```

This gives you:

- **Visual feedback** - See exactly what the TUI renders
- **Debug output** - See state transitions, events, timing
- **Correlation** - Match visual changes to log events

**When to use this method:**

- Investigating "why did X happen?" bugs (like issues disappearing after watcher sync)
- Performance issues (timing info in logs)
- State management bugs (state transitions visible in logs)
- Any bug where you need to understand the sequence of events

**For headless visual capture (CI, automated tests):**

See [.claude/skills/visual-test.md](.claude/skills/visual-test.md) for ttyd + Playwright.

```bash
# Small test repo for faster loading
rm -rf /tmp/test-repo && mkdir -p /tmp/test-repo
echo -e "# Test\n- [ ] Task 1\n- [x] Task 2" > /tmp/test-repo/test.md

pkill -f ttyd 2>/dev/null || true
FORCE_TTY=1 ttyd -W -p 7681 bun km view -r /tmp/test-repo test.md &
sleep 5
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/tui.png
```

**⛔ Peekaboo Rules:**

1. **NEVER use Peekaboo without explicit user approval** - Ask first, get a clear "yes"
2. **Try ttyd+Playwright at least 10 times first** - Different wait times, viewport sizes, env vars
3. **If ttyd doesn't work, that's a bug to fix** - Create a bead and fix it, don't switch to Peekaboo
4. **When asking for Peekaboo approval**, explain what you tried and why it failed

**Visual Bug Fixing:** You CANNOT fix what you cannot see. BEFORE attempting any fix:

1. Reproduce the bug visually (screenshot showing the issue)
2. If you can't reproduce, ask user for help - DO NOT guess at fixes
3. After fix, capture AFTER screenshot and compare
4. For recurring bugs, wait for user confirmation before closing

### 14. No Defensive Fallbacks

**Fail fast, don't mask bugs.** Programming errors MUST throw, never fall back.

- Missing required dependency → throw (programming error)
- Invalid internal state → throw (invariant violation)
- User input failure → handle gracefully
- No backwards compat shims — delete old code, fix callers

See [docs/00-principles.md](docs/00-principles.md) §6 for full details.

### 15. Domain Objects via Factory Functions

All functionality exposed through **domain objects created by factory functions**.

- Factory functions (not classes) → plain objects with methods
- No singletons → pass dependencies explicitly
- Disposable lifecycle → `using repo = createRepo(path)`

**Core objects:** `Repo`, `Board`, `Watcher`, `Config`

See [docs/00-principles.md](docs/00-principles.md) Part 1 for the philosophy and patterns.

### 16. Version Info

**Single source of truth:** `package.json` version field

**Never hardcode versions.** Import from `@km/core`:

```typescript
import { VERSION, BUILD_INFO } from "@km/core"

// VERSION = "0.1.0"
// BUILD_INFO = { version, gitCommit, gitBranch, gitDirty, buildTime }
```

**Build-time generation:** Version info is generated at build time via `bun run build:info`, which creates `packages/km-core/src/build-info.gen.ts`. This file is gitignored.

**For diagnostics**, include git commit in error messages or debug output:

```typescript
import { BUILD_INFO } from "@km/core"
debug("startup", { version: BUILD_INFO.version, commit: BUILD_INFO.gitCommit })
```

### 17. Prior Art

Related projects (cloudi, kimmi, decker) share patterns with km. See [docs/dev/prior-art.md](docs/dev/prior-art.md) for details.

### 18. Releasing

Use [release-it](https://github.com/release-it/release-it) for GitHub releases:

```bash
bun release              # Interactive (prompts for version type)
bun release patch        # Patch: 0.1.0 → 0.1.1
bun release minor        # Minor: 0.1.0 → 0.2.0
bun release --dry-run    # Preview without changes
```

This automatically: bumps version in package.json, regenerates build-info.gen.ts, updates CHANGELOG.md from conventional commits, creates git tag, creates GitHub release, and pushes.

**Prerequisites**: Clean working directory, on `main` branch, `gh` CLI authenticated.

See [docs/dev/releasing.md](docs/dev/releasing.md) for full details
