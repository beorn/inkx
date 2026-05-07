---
mentions:
  - km
id: "@km/rev-code-0127"
aliases:
  - km-rev-code-0127
  - "@km/_orphan/rev-code-0127"
created_at: 2026-01-27T14:27:53Z
closed_at: 2026-01-27T14:41:50Z
---

# [x] Code review: Comprehensive analysis 2026-01-27 @km/rev-code-0127 #epic #P2

## Code Review: km Project - Comprehensive Analysis

**Date**: 2026-01-27
**Scope**: Full codebase (all areas)
**Test Status**: ✅ All tests passing (3104 fast, 216 slow)

---

## Summary

**4 critical**, **8 high**, **11 medium**, **5 low** priority findings

**Knip**: 58 unused files (46 in vendor/), 17 unused deps, 264 unused exports

**Test Suite Health**: Excellent coverage overall, but @km/_orphan/board package untested

**Architecture**: ✅ Zero layer violations - well-maintained boundaries

**Documentation**: Some drift between specs and implementation

---

## Critical (blocks correctness)

### 1. Singletons in @km/storage (Active Migration)

**Location**: [packages/@km/storage/src/db-instance.ts](packages/@km/storage/src/db-instance.ts)

**Issue**: Module-level singletons marked @deprecated but still exported:

- `dbInstance: Database | null = null` (line 31)
- `dbInjected = false` (line 34)
- `dbContext = new AsyncLocalStorage<Database>()` (line 37)

**Functions**: `getDb()`, `setDb()`, `resetDb()`, `runWithDb()` - 5 deprecated exports

**Impact**: Breaks test isolation, hidden dependencies, prevents parallel testing

**Status**: File header says "Use Repo domain object instead" but functions remain public

---

### 2. Event Hub Singletons

**Location**: [packages/@km/storage/src/emit.ts](packages/@km/storage/src/emit.ts)

**Issue**: Module-level state for event broadcasting:

- `eventHub: { broadcast } | null = null` (line 25)
- `fsSync: { applyEventToFs } | null = null` (line 28)
- `kmDirContext = new AsyncLocalStorage<string>()` (line 31)
- `defaultKmDir = process.env.KM_DIR ?? ".km"` (line 44)

**Functions**: 13 deprecated exports (`emit()`, `emitNodeCreated()`, `emitNodeUpdated()`, etc.)

**Impact**: Same as db-instance - global state prevents proper testing and composability

**Recommendation**: Complete the Emitter migration or quarantine deprecated exports

---

### 3. @km/_orphan/board Package Completely Untested

**Location**: [packages/@km/_orphan/board/](packages/@km/_orphan/board/)

**Issue**: ZERO tests for critical navigation layer

- Source files: `board-reducer.ts`, `board-reducer-new.ts`, `board-types.ts`
- Test directory: Empty (only `.gitkeep`)
- Exported functions: `boardReducer`, `createBoardState` - **UNTESTED**

**Impact**: Board state reducer is critical for TUI navigation. Refactoring risk is high without tests.

**Note**: `board-reducer-new.ts` exists alongside old - unclear migration status

**Recommendation**: Priority HIGH - Add comprehensive test suite before any changes

---

### 4. Test Timing Documentation Drift

**Location**: [CLAUDE.md:8](CLAUDE.md#L8)

**Issue**: Documented "Fast tests (<5s)" but actual timing is **10.55s**

- Documentation claims: <5 seconds
- Actual measurement: 10.55s (2.1x documented)
- This is >50% delta threshold

**Impact**: Developers expect fast iteration (<5s) but actual is 10s, affecting TDD workflow

**Recommendation**: Update CLAUDE.md to reflect actual timing or optimize test suite

---

## High (causes bugs or blocks development)

### 5. Classes Violate Factory Function Principle

**Location**: Multiple files (17 instances)

**Production classes**:

- [packages/@km/storage/src/sync.ts:99](packages/@km/storage/src/sync.ts#L99) - `SyncManager extends EventEmitter`
- [packages/@km/storage/src/writequeue.ts:302](packages/@km/storage/src/writequeue.ts#L302) - `WriteQueue extends EventEmitter`
- [packages/@km/storage/src/watcher.ts:46](packages/@km/storage/src/watcher.ts#L46) - `FileSystemWatcher extends EventEmitter`
- [packages/@km/storage/src/parse-pool.ts:48](packages/@km/storage/src/parse-pool.ts#L48) - `ParsePool`
- [packages/@km/storage/src/store.ts:302](packages/@km/storage/src/store.ts#L302) - `MemoryStore extends BaseStore`
- [packages/@km/_orphan/core/src/toast.ts:56](packages/@km/_orphan/core/src/toast.ts#L56) - `ToastQueue`
- [packages/@km/_orphan/core/src/events.ts:125](packages/@km/_orphan/core/src/events.ts#L125) - `DisposableStore implements Disposable`

**Context**: docs/principles.md (lines 168-172) claims "Why not classes" but infrastructure layer uses them extensively

**Analysis**: These are infrastructure/performance classes (EventEmitter, worker pools), not domain objects. May be intentional but undocumented.

**Recommendation**: Either document rationale for infrastructure classes OR refactor to factory functions

---

### 6. Command Context Type Mismatch

**Location**: [docs/ref/commands.md](docs/ref/commands.md#L73-L115) vs [packages/@km/_orphan/commands/src/types.ts](packages/@km/_orphan/commands/src/types.ts)

**Issue**: Documentation describes comprehensive `Ctx` interface with storage access, but implementation has smaller `CommandContext`:

**Documented**: `Ctx` with `storage`, `dispatchBoard`, `dispatch`, `refresh()`, `buildTree()`
**Actual**: `CommandContext` with only cursor, selection, viewMode, position

**Missing from implementation**: Storage layer access, mutation dispatchers, layer state

**Impact**: Commands can't directly access storage as documented design suggests

**Status**: Architecture doc describes "Design Target (Future)" but this isn't labeled as unrealized

**Recommendation**: Update docs to clarify actual vs target, or implement missing features

---

### 7. Large Files Need Splitting

**Location**: Multiple (8 files >800 lines)

**Priority candidates**:

1. [packages/@km/storage/src/repo.ts](packages/@km/storage/src/repo.ts) - **1,385 lines**
  - Split into: repo-core.ts, repo-hooks.ts, repo-mutations.ts, repo-test.ts
2. [apps/@km/tui/src/board-actions.ts](apps/@km/tui/src/board-actions.ts) - **1,230 lines**
  - Split by category: zoom, nav, selection, edit actions
3. [apps/@km/tui/src/views/Board.tsx](apps/@km/tui/src/views/Board.tsx) - **825 lines**
  - Separate rendering logic from state management

**Medium priority**: repo-loader.ts (1,236), reconcile.ts (1,166), sync.ts (863)

**Recommendation**: Focus on repo.ts and board-actions.ts first (both >1200 lines)

---

### 8. App Tests Import Storage Layer Directly

**Location**: Multiple test files

**Issue**: App-layer tests importing storage testing utilities:

- [apps/@km/_orphan/cli/tests/cli-unit.test.ts](apps/@km/_orphan/cli/tests/cli-unit.test.ts) - imports `getNode`, `getTasksByStatus` from @km/storage
- [apps/@km/tui/tests/*.test.ts](apps/@km/tui/tests/) - 6 files import `createFakeRepo` from @km/storage

**Analysis**:

- Importing test doubles (`createFakeRepo`) is ACCEPTABLE
- Importing raw DB query functions (`getNode`, `getTasksByStatus`) is a minor violation
- Should access through Repo APIs instead

**Severity**: High (layer boundary, but limited scope)

**Recommendation**: Replace raw query imports with Repo API access

---

### 9. Unused Dependencies and Exports

**Location**: Multiple package.json files

**Unused dependencies (17)**:

- Apps: `@beorn/chalkx`, `@km/board`, `@km/markdown`, `ink-select-input` (@km/_orphan/cli)
- Apps: `inkx`, `react` (@km/_orphan/repl)
- Apps: `@beorn/inkx-ui`, `fullscreen-ink`, `ink`, `wrap-ansi` (@km/tui)
- Packages: `@km/core`, `@km/storage` (@km/_orphan/connector-caldav)
- Packages: `ulid` (@km/_orphan/core)
- Packages: 3 markdown utilities (@km/markdown)

**Unused exports (264)**: Large number across all packages

**Impact**:

- Security risk (outdated deps)
- Slower installs
- Confusing API surface (unused exports)

**Recommendation**: Run cleanup pass with `bun lint:unused` and remove flagged items

---

### 10. Hardcoded Test Expectations May Drift

**Location**: Multiple test files

**Examples**:

- [packages/@km/markdown/tests/roundtrip.test.ts](packages/@km/markdown/tests/roundtrip.test.ts) - Many `toContain("specific text")` assertions
- [packages/@km/storage/tests/query.test.ts](packages/@km/storage/tests/query.test.ts) - Hardcoded AST structure checks

**Risk**: MODERATE - If markdown syntax or query AST changes, tests will fail with cryptic diffs

**Mitigation**: Tests use `normalizeMarkdown()` helper and semantic assertions

**Recommendation**: Acceptable for now, consider snapshot tests for complex structures

---

### 11. Documentation Drift: Node Types

**Location**: [docs/storage.md](docs/storage.md) and [docs/concepts.md](docs/concepts.md) vs implementation

**Missing from docs**:

- `"embed"` type in NodeType enum
- `fs_mtime` field in KNode interface

**Impact**: LOW - Minor inconsistency, doesn't affect functionality

**Recommendation**: Update storage.md to document `"embed"` type and `fs_mtime` field

---

### 12. Test:slow Passes But Takes 69s

**Status**: ✅ All 216 slow tests pass (4 skipped)

**Timing**: 69.11s - within expected range for slow tests

**Skipped test**: [packages/@km/storage/tests/sync/chaos/regression.slow.test.ts](packages/@km/storage/tests/sync/chaos/regression.slow.test.ts)

- Legitimate placeholder: `test.skip("no regression scenarios defined yet")`

**Recommendation**: None - working as expected

---

## Medium (tech debt)

### 13. Deprecated Exports Not Quarantined

**Location**: Multiple files (19 @deprecated markers)

**Files with most deprecated exports**:

- emit.ts - 13 deprecated functions
- db-instance.ts - 5 deprecated functions
- config.ts - 3 deprecated functions

**Issue**: docs/principles.md advocates "Quarantine and Delete" but deprecated code remains exported

**Quote from principles.md**: "If fallbacks exist, old patterns persist forever" (line 425)

**Status**: Code is marked @deprecated but not quarantined - exports remain public

**Recommendation**: Create deprecation timeline or move to internal/ subdirectory

---

### 14. Unused Files (58 total, 46 in vendor/)

**Production code (12 files)**:

- [apps/@km/_orphan/cli/src/execute.ts](apps/@km/_orphan/cli/src/execute.ts)
- [apps/@km/tui/src/views/Toast.tsx](apps/@km/tui/src/views/Toast.tsx)
- [apps/@km/_orphan/cli/tests/@km/repl/ts](apps/@km/_orphan/cli/tests/@km/repl/ts)
- [apps/@km/_orphan/cli/tests/mdtest-sh-plugin.ts](apps/@km/_orphan/cli/tests/mdtest-sh-plugin.ts)
- [tests/fail-on-console.ts](tests/fail-on-console.ts)

**Vendor code (46 files)**: Examples, benchmarks, tests in upstream dependencies

**Severity**: MEDIUM for production files, LOW for vendor/

**Recommendation**: Delete production unused files, ignore vendor/ (upstream code)

---

### 15. File Organization Needs Improvement

**Location**: [packages/@km/storage/src/](packages/@km/storage/src/)

**Issue**: Too many db-*.ts files at root level (9 files)

- db.ts, db-events.ts, db-instance.ts, db-links.ts, db-ops.ts, db-rules.ts, etc.

**Suggestion**: Create `db-operations/` or `db-mutations/` subdirectory

**Also**: @km/tui/src has mixed utilities and state management at root

**Recommendation**: LOW priority - code works, but organization could improve discoverability

---

### 16. Module-Level State (Pattern 2)

**Location**: 24 instances across codebase

**Critical** (covered in Critical section):

- db-instance.ts singletons
- emit.ts singletons

**Acceptable** (performance/ergonomics):

- [packages/@km/markdown/src/parser.ts:45](packages/@km/markdown/src/parser.ts#L45) - `const TASK_MARK_REGEX = new RegExp(...)` - Compiled once, immutable
- [packages/@km/tree/src/body.ts:15](packages/@km/tree/src/body.ts#L15) - `const STRUCTURAL_TYPES = new Set([...])` - Constant lookup

**CLI state** (expected):

- apps/@km/_orphan/cli/src/program.ts - `let rootExplicitlySet = false` - CLI argument parsing
- apps/@km/_orphan/cli/src/debug-log.ts - `let stream | null = null` - Logging infrastructure

**Recommendation**: Focus on db-instance.ts and emit.ts (critical), others are acceptable

---

### 17. Missing Symbol.dispose in Factories

**Location**: 43 factory functions, 26 files flagged

**Issue**: Many factories create resources but don't implement disposal:

- createLinkResolver, createDbOps, createIgnoreMatcher
- Test factories: createVerifier, createTestConfig, createScenario

**Analysis**:

- **Critical**: Factories managing DB/file resources should have Symbol.dispose
- **Low**: Test factories and pure functions don't need it

**Recommendation**: Add Symbol.dispose to factories managing resources (DB, files, watchers)

---

### 18. Defensive Fallbacks Pattern

**Location**: 51 instances of `?? defaultValue`

**Examples**:

- [packages/@km/storage/src/db-events.ts:95](packages/@km/storage/src/db-events.ts#L95) - `(data.parent_idx as number) ?? 0`
- [packages/@km/storage/src/repo.ts:660](packages/@km/storage/src/repo.ts#L660) - `ctx.changes ?? {}`

**Analysis**:

- **Legitimate**: Handling optional fields (`parent_idx ?? 0`, `changes ?? {}`)
- **Suspicious**: Masking programming errors where value should exist

**False positive rate**: HIGH (pattern detection flagged 51, most are legitimate)

**Recommendation**: Manual review of flagged instances - most are acceptable

---

### 19. Global Getters (89 functions)

**Location**: Multiple files

**Analysis**: Pattern detection flagged all functions starting with `get*` as "global getters"

**False positives**: Most are legitimate query functions:

- `getNode(db, id)` - Takes db parameter, not singleton access
- `getTasksByStatus(db, status)` - Proper dependency injection
- `getSiblings(nodes, path)` - Pure function

**True positives** (singleton access):

- `getDb()` - Singleton access (covered in Critical)
- `getKmDir()` - Singleton access (covered in Critical)

**Recommendation**: Ignore - naming pattern is fine, focus on actual singletons

---

### 20. Commands Registry Singleton

**Location**: [packages/@km/_orphan/commands/src/registry.ts:3](packages/@km/_orphan/commands/src/registry.ts#L3)

**Code**: `const commands = new Map<string, CommandDef>()`

**Analysis**: Module-level Map for command registry

**Status**: Acceptable - registry is populated at import time, read-only after initialization

**Similar patterns**: @km/_orphan/commands/keybindings.ts also has module-level registry

**Recommendation**: LOW priority - registries are a legitimate use of module-level constants

---

### 21. Bead Sync Failure

**Location**: [.beads/sync-state.json](.beads/sync-state.json)

**Issue**: Git pull failed recently

- Error: "Cannot rebase onto multiple branches"
- Failure count: 1
- Backoff until: 2026-01-27T13:58:37

**Impact**: Beads may be out of sync with remote

**Recommendation**: Fix git pull configuration, check for conflicting branches

---

### 22. Duplicate Beads (23 found)

**Location**: Bead tracking system

**Examples** (same title, different IDs):

- "Add chaos test coverage metrics" (2 beads)
- "Create @beorn/flexx - Pure JS flexbox layout engine" (2 beads)
- "@km/_orphan/repl: interactive shell with filesystem semantics" (2 beads)

**Impact**: Confusion about authoritative bead, potential duplicate work

**Recommendation**: Consolidate duplicates, choose canonical bead ID

---

### 23. Event System Has Undocumented Features

**Location**: [docs/architecture.md](docs/architecture.md) vs implementation

**Status**: CORRECT with additions beyond documentation

**Missing from docs**:

- `DisposableStore` class for managing multiple subscriptions
- Three disposal patterns (unbind, .dispose(), Symbol.dispose)

**Impact**: LOW - implementation exceeds documentation (good thing)

**Recommendation**: Add DisposableStore to architecture.md events section

---

## Low (style/minor issues)

### 24. Vendor Files Flagged as Unused (46 files)

**Location**: vendor/* directories

**Files**: Examples, benchmarks, upstream tests

- vendor/beorn-chalkx/examples/*
- vendor/beorn-inkx/tests/*
- vendor/beorn-inkx/examples/*

**Status**: EXPECTED - upstream code, not part of km project

**Recommendation**: Configure knip to ignore vendor/ directories

---

### 25. Configuration Hints from Knip (23 suggestions)

**Type**: Knip suggestions for improving configuration, not actual findings

**Examples**:

- "Add entry and/or refine project files in workspaces"
- "Refine entry pattern (no matches)"
- "Remove redundant entry pattern"

**Status**: INFORMATIONAL - knip configuration optimization

**Recommendation**: Review and apply if helpful, but not blocking

---

### 26. Naming Inconsistency in Beads Docs

**Location**: Bead documentation files

**Issue**: Mixed naming "Ink 2.0" vs "Inkx" vs "@km/_orphan/silvery-legacy" vs "@km/inkz"

**Impact**: Terminology confusion when reading docs

**Recommendation**: Standardize on one naming convention

---

### 27. Missing Closed Checks (21 files)

**Location**: Factories without fail-fast closed checks

**Issue**: Pattern detection flagged factories that don't check if resource is closed before use

**Analysis**:

- **Critical**: Watchers, DB connections should fail-fast if closed
- **Low**: Pure factories don't need closed checks

**Recommendation**: Add closed checks to stateful resources (watchers, pools, queues)

---

### 28. Unused devDependencies (7)

**Location**: package.json files

**List**:

- @types/react (@km/_orphan/repl)
- @steipete/peekaboo (root)
- ink-testing-library (root)
- node-pty (root)
- react-devtools-core (root)
- chalk (beorn-inkx)
- vitepress-plugin-llms (beorn-inkx)

**Impact**: Slower install, clutter

**Recommendation**: Remove if confirmed unused

---

## Quick Wins

1. **Update test timing in CLAUDE.md** - Change "<5s" to "~10s" (1 line change)
2. **Delete 12 unused production files** - Remove execute.ts, Toast.tsx, etc. (verify first)
3. **Remove unused dependencies** - Clean up 17 unused deps from package.json files
4. **Fix bead sync** - Resolve git rebase conflict
5. **Consolidate 23 duplicate beads** - Merge duplicate tracking items

---

## Larger Refactors

1. **Complete singleton migration** (estimated: 2 files, ~200 LOC affected)
  - Delete or quarantine deprecated exports in db-instance.ts and emit.ts
  - Migrate remaining callers to Repo/Emitter domain objects
2. **Add @km/_orphan/board test suite** (estimated: new test file, ~300 LOC)
  - Test boardReducer state transitions
  - Test cursor movement, selection, fold/unfold, zoom
  - Cover edge cases (empty board, single item)
3. **Split large files** (estimated: 3 files, refactor only)
  - repo.ts → 4 files (repo-core, repo-hooks, repo-mutations, repo-test)
  - board-actions.ts → 5 files (zoom, nav, selection, edit, core)
  - Board.tsx → 2 files (rendering, state)
4. **Convert infrastructure classes to factories** (estimated: 7 files, medium complexity)
  - SyncManager, WriteQueue, FileSystemWatcher
  - ParsePool, MemoryStore, ToastQueue, DisposableStore
5. **Update command context documentation** (estimated: docs update only)
  - Clarify actual vs target implementation
  - Document migration path

---

## Verification Plan

**After cleanup**:

1. Run `bun lint:unused` - should show 0 unused production files
2. Run `bun run test:fast` - should pass in ~10s with no warnings
3. Run `bun run test:all` - should pass (3320 total tests)
4. Grep for `export class` in packages/ - should only find infrastructure layer
5. Grep for `@deprecated` in packages/ - should find 0 after migration
6. Verify CLAUDE.md timing matches actual test:fast timing
7. Check bead sync status - should be healthy

**Architecture boundaries**:

1. Verify @km/_orphan/board has test coverage >80%
2. Check that app-layer tests don't import raw storage queries
3. Confirm no new singletons introduced

---

## Process Improvements

Based on this review, recommend:

1. **Add ESLint rules**:
  - `no-classes` outside infrastructure layer
  - Detect singleton patterns (module-level let/var)
  - Flag @deprecated exports older than 90 days
2. **CI checks**:
  - Add `bun lint:unused` to pre-commit or CI
  - Verify test timing stays within documented range
  - Block PRs with >5 new unused exports
3. **Documentation**:
  - Add "Common Mistakes" table to principles.md
  - Document when infrastructure classes are acceptable
  - Clarify DI patterns with before/after examples
4. **Review workflow refinements**:
  - Update pattern detection to exclude legitimate `?? {}` for optional fields
  - Improve global getter detection (filter by actual singleton access)
  - Add pattern for TODO comments older than 6 months

