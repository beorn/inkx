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

When modifying TUI styling (colors, selection states, visual hierarchy), you MUST consult [docs/06-ui.md](docs/06-ui.md). Key rules:

- **Selection**: `cyan` background + `black` foreground (NEVER blue/white)
- **Reserved colors**: `cyan` bg = selection only, `inverse` = input cursor only
- **Headers**: `yellow` (selected) / `yellowBright` + dim (unselected)
- **Status icons**: Use both color AND shape (colorblind-safe)
- **Background colors**: Use inkx `backgroundColor` OR chalk.bg\*, never both on same element (throws by default)

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

#### ESM Only - No require()

**NEVER use `require()`.** This is a Bun/ESM codebase. Always use ES module imports:

```typescript
// ❌ BAD - CommonJS require
const fs = require("fs");
const { readFileSync } = require("fs");

// ✅ GOOD - ES module import
import fs from "fs";
import { readFileSync } from "fs";
```

This applies to all code including:

- Dynamic imports (use `await import()` not `require()`)
- JSON files (use `import data from "./data.json"`)
- Optional dependencies (use try/catch with `await import()`)

### 5. Test-Driven Development

**Test commands:**

```bash
bun run test:fast    # ⚡ USE THIS for fast iteration (<5s target)
bun run test:all     # ALL tests - unit + mdtest (~2min, run before committing)
bun run test:mdtest  # Only mdtest integration tests (*.test.md)
```

**test:fast performance target: <5 seconds**. If test:fast takes longer than 5 seconds, schedule a cleanup/pruning/optimization round. Move slow integration tests to `*.slow.test.ts` suffix to exclude them from test:fast.

**⚠️ NEVER use bare `bun test`** - it picks up archived tests in `archive/` and takes forever. Always use the npm scripts above.

**⚡ IMPORTANT: Use `bun run test:fast` during development!**

- `test:fast` should complete in <5 seconds - use this while iterating
- Only run `test:all` before committing (~2 minutes)

**BEFORE committing any code changes:**

```bash
bun fix              # MUST pass - auto-fix lint + format
bun run test:all     # MUST pass - all tests including mdtest
```

**During development:**

```bash
bun run test:fast    # Run this frequently - 24 second feedback loop
```

**When implementing features:**

1. Write acceptance test first (should fail)
2. Implement feature
3. `bun run test:fast` passes (iterate here!)
4. `bun fix` passes
5. `bun run test:all` passes (final check before commit)
6. Commit

**⚠️ CRITICAL: Test Safety - Use Isolated Test Directories**

**NEVER run sync operations or tests on:**

- The km source code repository itself
- User vaults with real data
- Any directory containing non-markdown files you care about

**ALWAYS use isolated test directories:**

- Tests use `/tmp/kmtest-*` directories that are created and destroyed per test
- Manual testing should use throw-away test vaults:
  ```bash
  # Create a test vault
  rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
  echo -e "# Test\n- [ ] Task 1" > /tmp/test-vault/test.md
  bun km view /tmp/test-vault
  ```

**Why this matters (km-me0n incident):**

- `km sync --to-fs` once corrupted source files by converting them to markdown stubs
- Any sync operation that writes to filesystem must be tested in isolation
- E2E tests in `packages/km-storage/tests/e2e/` verify sync never touches non-.md files

### 6. New Package Checklist (MUST FOLLOW)

When creating a new package under `packages/`:

**Vendor Packages (`vendor/`):**

Packages in `vendor/` are standalone libraries that could be useful outside km. When creating a new vendor package:

1. **Create as git submodule** - Never commit vendor code directly to km
2. **Create public GitHub repo** - `gh repo create beorn/<name> --public`
3. **Add as submodule** - `git submodule add git@github.com:beorn/<name>.git vendor/beorn-<name>`
4. **Push both repos** - Push the new repo, then commit the submodule reference in km

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
- If you update an interface, grep for doc references and update them

**When docs exist:**

- Before modifying a type, check if it's documented (grep for type name in `docs/`)
- After modifying, update docs in the SAME commit
- If docs and code disagree, code is truth - update docs to match

**For detailed testing guidance**, see [docs/dev/testing.md](docs/dev/testing.md):

- Which test type to use for each layer
- How to use `km sh` + `mdtest` for TUI behavior tests
- Coverage goals per layer

**Chaos testing for sync bugs:** Use `/chaos-test` to discover and fix file synchronization bugs. This runs a property-based fuzzer that simulates edge cases like dropped events, reordering, and race conditions. See [docs/dev/chaos-testing.md](docs/dev/chaos-testing.md) for details.

---

### 8. Beads Issue Tracking

This project uses [beads](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

```bash
bd ready                   # Find available work (no blockers)
bd show <id>               # View issue details
bd list                    # List all issues
bd list --status open      # Filter by status
bd update <id> --status in_progress  # Update issue
bd close <id>              # Complete work
bd close <id> -r "reason"  # Close with reason (NOT --comment)
bd comments add <id> "text"  # Add comment to issue
bd create --title="..." --type=task --priority=2
bd sync                    # Commit beads changes
```

**Workflow:** `bd ready` → claim → work → `bd close` → `bd sync`

**Multi-session coordination:** When multiple Claude Code sessions work on the same codebase, use `/bd` skill for session-aware claiming:

```bash
/bd                 # Dashboard: ready work + active claims
/bd work <bead-id>  # Claim and start working (shows details)
/bd my              # See your active claims
/bd close <bead-id> # Complete work (auto-releases claim)
/bd release         # Release claim if switching tasks
```

Note: `/bd work`, `/bd my`, `/bd release` use the session script at `.claude/skills/bd/scripts/bd.ts`. Other commands use `bd` directly.

Claims expire after 30 min of session inactivity. Stale claims can be taken over.

**Key concepts:**

- Priority: P0=critical, P1=high, P2=medium, P3=low, P4=backlog
- Types: task, bug, feature, epic, chore
- Dependencies: `bd dep add <issue> <depends-on>`

**Grouped beads (for related issues):**

When creating multiple related beads (e.g., from an architecture review or multi-part feature), use parent-child hierarchy with explicit IDs:

```bash
# 1. Create parent with descriptive slug
bd create --id "km-review-sync" --type=epic --priority=2 \
  --title="Architecture review: sync layer" \
  --body-file /tmp/review.md

# 2. Create children with sequential suffix
bd create --id "km-review-sync.0" --title="Fix race condition" --type=bug --priority=1
bd create --id "km-review-sync.1" --title="Add retry logic" --type=task --priority=2
bd create --id "km-review-sync.2" --title="Update docs" --type=task --priority=3
```

Benefits:

- `bd show km-review-sync` shows parent with all children
- Related issues stay grouped in listings
- Clear audit trail of what was found together

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

km has two logging systems for different purposes:

| System    | Purpose            | When to use                                             |
| --------- | ------------------ | ------------------------------------------------------- |
| `debug()` | Internal tracing   | State dumps, performance timing, internal diagnostics   |
| `logger`  | User-facing output | Progress messages, errors, warnings the user should see |

**Quick reference:**

```typescript
// Internal diagnostics - use debug()
import createDebug from "debug";
const debug = createDebug("km:storage:watch");
debug("config", { watchEnabled, debounceMs });

// User-facing messages - use logger
import { createLogger } from "@km/core";
const logger = createLogger("@km/storage");
logger.info("Syncing vault...");
logger.error("Failed to write file", { path, error });
```

**CLI flags for log levels:**

```bash
bun km -s sync /tmp/test        # Silent (errors only)
bun km -v view /tmp/test        # Verbose (debug level)
bun km -vv view /tmp/test       # Very verbose (trace level)
bun km --log-level trace view   # Explicit level
LOG_LEVEL=debug bun km view     # Environment variable
DEBUG=km:* bun km view          # debug() still works independently
```

**Log levels:** `silent < error < warn < info < debug < trace`

#### debug() - Internal Diagnostics

Use for detailed internal tracing that's only useful when debugging.

**Namespace convention:**

```
km:<layer>:<subsystem>       # Main packages
inkx:<subsystem>             # inkx renderer
flexx:<subsystem>            # flexx layout engine
```

**Keep statements concise:**

```typescript
debug("resolved", resolved); // Objects
debug("loading %s...", filename); // Inline text
debug("state: %s → %s", oldState, newState); // Transitions
```

**TUI debugging (separate from TUI display):**

```bash
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault
# Then: tail -f /tmp/km.log
```

#### @beorn/logger - User Output

Use for messages the user should see during normal operation.

```typescript
import { createLogger } from "@km/core";
const logger = createLogger("@km/storage");

logger.info("Loading vault...");
logger.warn("Config file not found, using defaults");
logger.error("Failed to sync", { error });
```

**When to use which:**

- `debug()` → internal state, performance timing, data flow tracing
- `logger.info()` → progress, success messages, normal operation
- `logger.warn()` → recoverable issues, deprecation notices
- `logger.error()` → failures that affect user (show error to user)

### 13. Visual Testing & TUI Debugging

**Preferred method: DEBUG_LOG + Visual Inspection**

For debugging TUI issues, combine debug logging with visual inspection to see both what the code is doing AND how it renders:

```bash
# Terminal 1: Run TUI with debug logging to file
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault

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
# Small test vault for faster loading
rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault
echo -e "# Test\n- [ ] Task 1\n- [x] Task 2" > /tmp/test-vault/test.md

pkill -f ttyd 2>/dev/null || true
FORCE_TTY=1 ttyd -W -p 7681 bun km view -r /tmp/test-vault test.md &
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

### 14. No Defensive Fallbacks or Compatibility Shims

**Fail fast, don't mask bugs.**

**No backwards compatibility re-exports:**

```typescript
// BAD - keeping old export location "for compatibility"
export { foo } from "./old-location.ts"; // backwards compat

// GOOD - just remove it, update callers
// (delete the re-export entirely)
```

**No fallback chains that mask programming errors:**

```typescript
// BAD - silently hides missing data
function getName(node: Node): string {
  return node.title ?? node.data?.title ?? node.content ?? node.id.slice(0, 8);
}

// GOOD - throw if invariant is violated
function getName(node: Node): string {
  if (node.type === "section" && !node.title) {
    throw new Error(`Section ${node.id} missing title`);
  }
  return node.title!;
}
```

**When you find fallback/compat/deprecated code:**

1. **Determine intent**: Is this handling legitimate data variations, or masking bugs?
2. **Legitimate**: External input, user data, optional features → keep the handling
3. **Bug masking**: Internal invariants, required fields → replace with throw
4. **If unsure**: Create a bead to investigate, don't leave it unresolved

**Comments indicating tech debt:**

```typescript
// BAD - leaving breadcrumbs of past mistakes
// backwards compatibility
// legacy fallback
// deprecated, remove in v2

// GOOD - either fix it or create a bead
// Delete the code OR: bd create --title="Remove legacy X" --type=chore
```

**Rule of thumb**: If you wouldn't add this fallback/compat code today from scratch, remove it or create a bead to remove it later

### 15. Domain Object Pattern (MUST FOLLOW)

All major functionality MUST be exposed through **domain objects created by factory functions**.

**Principles:**

- **Factory functions** (not classes) - return plain objects with methods
- **No singletons** - all state owned by domain objects, passed via DI
- **Disposable lifecycle** - `Disposable` for sync cleanup, `AsyncDisposable` for async
- **Service interface** - for long-running objects with start/stop lifecycle

**Core domain objects:**

| Object    | Factory         | Lifecycle    | Purpose                     |
| --------- | --------------- | ------------ | --------------------------- |
| `Vault`   | `createVault()` | `Disposable` | Storage, queries, mutations |
| `Board`   | `createBoard()` | plain object | Navigation state            |
| `Watcher` | `vault.watch()` | `Service`    | File sync                   |
| `Config`  | `loadConfig()`  | plain object | Vault configuration         |

**Service interface** (for objects with start/stop lifecycle):

```typescript
interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping";
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

**Factory function pattern:**

```typescript
// ✅ GOOD - factory returns plain object
export function createVault(path: string, options?: VaultOptions): Vault {
  // Internal state via closure
  const db = options?.inject?.database ?? openDatabase(path);
  let closed = false;

  return {
    get path() {
      return path;
    },

    getNode(id) {
      if (closed) throw new Error("Vault is closed");
      return queryNode(db, id);
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    [Symbol.dispose]() {
      this.close();
    },
  };
}

// ❌ BAD - class with internal state
export class Vault {
  private db: Database;
  constructor(path: string) {
    this.db = openDatabase(path);
  }
}

// ❌ BAD - singleton
let _db: Database | null = null;
export function getDb() {
  if (!_db) throw new Error("Not initialized");
  return _db;
}
```

**Generator factories for progress reporting:**

```typescript
// Single factory - always a generator
function* createVault(path: string): Generator<ProgressInfo, Vault> {
  yield { phase: "discover", current: 0, total: 0 };
  // ... load vault ...
  return vault;
}

// Caller chooses consumption:
// A) With progress: for (const p of createVault(path)) spinner.update(p);
// B) Without:       const vault = runGenerator(createVault(path));
```

**Usage with disposables:**

```typescript
// Sync disposable (Vault, Board)
function processVault(path: string) {
  using vault = runGenerator(createVault(path));
  const tasks = vault.getAllTasks();
  // vault.close() called automatically at scope exit
}

// Async disposable (Service like Watcher)
async function watchVault(path: string) {
  using vault = runGenerator(createVault(path));
  await using watcher = vault.watch();
  await watcher.start();
  // ... do stuff ...
  // watcher.stop() awaited, then vault.close() called
}
```

**Dependency injection for testing:**

```typescript
const mockDb = new Database(":memory:");
const vault = runGenerator(
  createVault("/test", {
    inject: { database: mockDb },
  }),
);
```

See [docs/dev/domain-objects.md](docs/dev/domain-objects.md) for complete patterns guide

### 16. Version Info

**Single source of truth:** `package.json` version field

**Never hardcode versions.** Import from `@km/core`:

```typescript
import { VERSION, BUILD_INFO } from "@km/core";

// VERSION = "0.1.0"
// BUILD_INFO = { version, gitCommit, gitBranch, gitDirty, buildTime }
```

**Build-time generation:** Version info is generated at build time via `bun run build:info`, which creates `packages/km-core/src/build-info.gen.ts`. This file is gitignored.

**For diagnostics**, include git commit in error messages or debug output:

```typescript
import { BUILD_INFO } from "@km/core";
debug("startup", { version: BUILD_INFO.version, commit: BUILD_INFO.gitCommit });
```

### 17. Prior Art / Related Projects (cloudi, kimmi, decker)

These sibling projects share ideas, patterns, and code with km. Reference them for inspiration on implementation approaches. All are accessible on the local filesystem. For detailed comparisons, see [docs/dev/prior-art.md](docs/dev/prior-art.md).

---

**../cloudi** — AI email assistant + cloud PIM (Nov 2025 – Jan 2026, ~1300 commits)

Cloudi is a multi-mode Claude AI assistant combining an interactive CLI chat interface with an autonomous Gmail bot. The system stores all state in Gmail (tasks, contacts, drafts as key-value storage) rather than managing a separate database, enabling zero-infrastructure deployment. Features include conversation continuity across chat/email modes, tool result caching, and integration with Google Tasks/Contacts APIs. Built with Vercel AI SDK, TypeScript, Bun workspaces.

Notable patterns to borrow:

- Build-time version generation (`scripts/generate-build-info.ts` → `build-info.gen.ts`)
- Structured logger (`@beorn/logger`) with log levels + `--log-level` CLI flag
- Type-safe env config via Zod (`@cloudi/env-config`)
- AppContext pattern for dependency injection
- Feature/task ID system (F###, T###) in CHANGELOG
- Factory functions over classes for better tree-shaking

---

**../kimmi** — Local-first PIM with CRDT sync (Oct 2025 – Jan 2026, ~1200 commits)

Kimmi is a local-first personal information manager that unifies contacts, calendar, notes, tasks, and files using Automerge CRDTs for conflict-free replication. It syncs bidirectionally with external PIM systems (CardDAV/CalDAV for iCloud, Google, Outlook) while maintaining complete local control. The architecture uses a Repo-based CRDT model with separate tree and content documents, enabling partial replication and efficient network sync.

Key differences from km:

- **Storage**: Automerge CRDTs vs SQLite — CRDTs enable automatic conflict resolution for multi-device sync
- **Scope**: Full PIM (contacts, calendar, notes, tasks, files) vs task-focused markdown files
- **Sync**: Bidirectional with external systems (CardDAV connectors) vs file system as source of truth

Notable patterns:

- `@kimmi/obs` — Structured logging with hierarchical namespaces
- Connector architecture for external system sync
- Shadow cache pattern for external data

---

**../../DZ/decker** — Web-based collaborative boards (Jan 2020 – Jan 2025, ~3000 commits)

Decker (also called Boardliner) is a web-based document and project management app built with Next.js, React, Slate editor, and Yjs for real-time collaboration. Enables hierarchical document organization with kanban-style board views, drag-and-drop cards, outline editing, live cursors, and cloud sync. Collaboration with Mike Welch exploring rich board interfaces before km's TUI approach.

Relationship to km's board view:

- Both model tasks as hierarchical nodes with columns/cards, cursor navigation, fold states
- Decker is web-based with drag-and-drop; km is TUI-optimized for keyboard efficiency
- Decker has real-time multi-user collaboration (Yjs); km is single-user file-based
- Similar concepts: zoom, navigation history, move mode, selection states

Tech stack: Next.js, React, Slate, Yjs, Radix UI, Tailwind, PostgreSQL, Redis

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
