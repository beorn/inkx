# Test System Architecture

The km test system combines the best of two worlds: **Vitest's powerful testing framework** with **Bun's fast runtime and native APIs**. This document explains why we use `bunx --bun vitest`, how the architecture works, and how to run tests effectively.

---

## Table of Contents

1. [Overview](#overview)
2. [Why Vitest with Bun Runtime?](#why-vitest-with-bun-runtime)
3. [Architecture](#architecture)
4. [Running Tests](#running-tests)
5. [Test Categories](#test-categories)
6. [Migration History](#migration-history)
7. [Implementation Details](#implementation-details)
8. [Future Improvements](#future-improvements)

---

## Overview

**Key Principle**: All tests run via Vitest (`bunx --bun vitest`) with Bun as the runtime.

This unified approach gives us:

- Vitest's mature testing framework and TAP streaming
- Bun's fast runtime and native APIs (`bun:sqlite`, `bun:ffi`, etc.)
- Real-time test feedback via TAP protocol
- Single test runner for the entire codebase

**No More Hybrid**: Previously, we split tests between Bun Test (for packages using `bun:sqlite`) and Vitest (for everything else). This created complexity and required JUnit-to-TAP conversion. The all-Vitest approach eliminates this.

---

## Why Vitest with Bun Runtime?

### The Problem with Pure Bun Test

Bun's built-in test runner lacks native TAP support. While it has a `--bail` JUnit reporter, streaming test results in real-time requires:

1. Running Bun Test with JUnit output
2. Converting JUnit XML to TAP format
3. Streaming the converted TAP output

This adds complexity and latency to test feedback.

### The Problem with Pure Vitest

Vitest runs on Node.js by default, which doesn't support Bun-specific APIs like:

- `bun:sqlite` - Used heavily in `@km/storage` for SQLite operations
- `bun:ffi` - Used for native integrations
- Bun's `Worker` implementation

Porting these to Node.js equivalents would require significant rewrites.

### The Solution: Vitest + Bun Runtime

Vitest can run on **any JavaScript runtime** by using `bunx --bun vitest`:

```typescript
// vendor/beorn-tap/src/producers/vitest.ts
export function runVitestTap(options: VitestTapOptions = {}): VitestTapResult {
  const args = ["vitest", "run", "--reporter=tap", ...(options.args ?? [])]

  const proc = spawn(["bunx", "--bun", ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "inherit",
  })

  return { stdout: proc.stdout, proc, exited: proc.exited }
}
```

**How it works**:

1. `bunx` downloads/runs `vitest` from npm
2. `--bun` flag forces Bun as the JavaScript runtime (not Node.js)
3. Vitest runs normally but with access to all Bun APIs
4. `--reporter=tap` streams results in TAP format for real-time feedback

**Benefits**:

- ✅ Vitest's mature testing framework (describe, test, expect, etc.)
- ✅ Native TAP streaming (no conversion needed)
- ✅ Full access to Bun APIs (`bun:sqlite`, `bun:ffi`, `Worker`)
- ✅ Fast execution via Bun runtime
- ✅ Single test runner for entire codebase

---

## Architecture

### Component Stack

```
┌─────────────────────────────────────────────────────────┐
│  User Commands (package.json scripts)                   │
│  bun run test:fast, test:slow, test:mdtest, test:all   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Test Scripts (TypeScript)                              │
│  scripts/run-tests.ts, scripts/test-all.ts             │
│  - Discover test files via test-patterns.ts            │
│  - Orchestrate test execution                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  TAP Orchestrator (@beorn/tap)                          │
│  vendor/beorn-tap/src/orchestrate.ts                    │
│  - Manages parallel/unified modes                       │
│  - Routes output to consumers                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Vitest TAP Producer                                    │
│  vendor/beorn-tap/src/producers/vitest.ts               │
│  - Spawns: bunx --bun vitest run --reporter=tap        │
│  - Streams TAP output in real-time                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Vitest (Test Framework)                                │
│  - Runs on Bun runtime (not Node.js)                    │
│  - Executes .test.ts, .spec.ts, .test.md files         │
│  - Full access to bun:sqlite and other Bun APIs         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  TAP Consumer (@beorn/tap)                              │
│  vendor/beorn-tap/src/consumer.ts                       │
│  - Parses TAP stream                                    │
│  - Displays colored dots (. = pass, F = fail)           │
│  - Shows summary (passed/failed/total)                  │
└─────────────────────────────────────────────────────────┘
```

### Test File Discovery

Test patterns are centralized in `scripts/test-patterns.ts`:

```typescript
export const TEST_PATTERNS = {
  fast: {
    include: [
      "packages/**/tests/**/*.test.ts",
      "packages/**/tests/**/*.spec.ts",
      "apps/**/tests/**/*.test.ts",
      "apps/**/tests/**/*.spec.ts",
    ],
    exclude: ["**/node_modules/**", "**/*.slow.test.ts"],
  },
  slow: {
    include: [
      "packages/**/tests/**/*.slow.test.ts",
      "apps/**/tests/**/*.slow.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  mdtest: {
    include: ["packages/**/tests/**/*.test.md", "apps/**/tests/**/*.test.md"],
    exclude: ["**/node_modules/**"],
  },
}
```

### TAP Streaming Flow

1. **Vitest generates TAP** - Native `--reporter=tap` flag
2. **TAP producer streams chunks** - Bun subprocess stdout as Uint8Arrays
3. **TAP consumer parses and displays** - Converts to colored dots in real-time
4. **Exit code reflects results** - Non-zero if any tests failed

Example TAP output:

```tap
TAP version 13
# Subtest: apps/km-tui/tests/board.spec.ts
    ok 1 - Board navigation > moves cursor down
    ok 2 - Board navigation > moves cursor up
    1..2
ok 1 - apps/km-tui/tests/board.spec.ts # time=45.234ms
1..1
```

---

## Running Tests

### Quick Reference

| Command                | What it runs                            | Duration | Use case             |
| ---------------------- | --------------------------------------- | -------- | -------------------- |
| `bun run test:fast`    | `.test.ts` + `.spec.ts` (excludes slow) | ~11s     | Default iteration    |
| `bun run test:slow`    | `.slow.test.ts` only                    | ~30s     | Sync/chaos iteration |
| `bun run test:mdtest`  | `.test.md` only                         | ~5s      | CLI iteration        |
| `bun run test:all`     | All tests via unified TAP               | ~45s     | Before commit        |
| `bun run test:all:tui` | All tests with parallel TUI (3 rows)    | ~45s     | Visual progress      |

### Detailed Usage

#### Fast Tests (Iteration Loop)

```bash
bun run test:fast
```

**What it does**:

- Discovers all `.test.ts` and `.spec.ts` files (excluding `.slow.test.ts`)
- Runs via `bunx --bun vitest run --reporter=tap`
- Streams TAP output with colored dots
- Returns exit code 1 if any tests fail

**When to use**: After every code change during development.

**Example output**:

```
...........F.............................................
517 tests, 1 failed, 516 passed
Time: 11.234s
```

#### Slow Tests

```bash
bun run test:slow
```

**What it does**:

- Discovers all `.slow.test.ts` files
- Runs chaos tests, sync integration tests, heavy I/O tests
- Same TAP streaming as fast tests

**When to use**: When working on sync, file watching, or chaos testing.

**Why separate**: These tests take 20-30s and shouldn't slow down normal iteration.

#### Markdown Tests

```bash
bun run test:mdtest
```

**What it does**:

- Discovers all `.test.md` files
- Runs via mdtest (markdown-based CLI tests)
- Uses in-memory database for speed

**When to use**: When working on CLI commands or acceptance tests.

**Example test** (`apps/km-cli/tests/sh/navigation.test.md`):

```markdown
---
mdtest:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true # ← Critical for fast tests
---

# Navigation Test

$ km sh board.md -c 'j; state'
cursor: [1]
```

#### All Tests (Unified TAP)

```bash
bun run test:all
```

**What it does**:

- Discovers all test files (fast + slow + mdtest)
- Runs via Vitest orchestrator in "unified" mode
- Interleaves TAP output from all suites
- Single stream of colored dots
- Ideal for CI/CD

**When to use**: Before committing, in CI pipelines.

**Implementation** (`scripts/test-all.ts`):

```typescript
const orchestrator = createOrchestrator({
  mode: "unified", // Interleaved dots (CI-friendly)
  suites: [
    {
      name: "vitest",
      runner: "vitest",
      files: allTests, // fast + slow + mdtest
    },
  ],
})
```

#### All Tests (Parallel TUI)

```bash
bun run test:all:tui
```

**What it does**:

- Runs fast, slow, and mdtest suites in parallel
- Displays 3 separate rows with real-time progress
- Each row shows: suite name, colored dots, timing
- Updates in place using ANSI cursor positioning

**When to use**: When you want visual progress tracking.

**Implementation** (`scripts/test-all-tui.ts`):

```typescript
const orchestrator = createOrchestrator({
  mode: "parallel", // Force parallel TUI mode
  suites: [
    { name: "vitest:fast", runner: "vitest", files: fastTests },
    { name: "vitest:slow", runner: "vitest", files: slowTests },
    { name: "vitest:md", runner: "vitest", files: mdTests },
  ],
  renderParallel, // Inject inline renderer
})
```

**Example output**:

```
vitest:fast  ....................................  (11.2s)
vitest:slow  ............                          (28.5s)
vitest:md    .....                                 (4.8s)

Total: 517 tests, 517 passed, 0 failed
```

---

## Test Categories

### By Speed

| Category | Pattern         | Duration | Included in           | Purpose                |
| -------- | --------------- | -------- | --------------------- | ---------------------- |
| Fast     | `.test.ts`      | <1s each | test:fast, test:all   | Unit/integration tests |
| Fast     | `.spec.ts`      | <1s each | test:fast, test:all   | TUI acceptance tests   |
| Slow     | `.slow.test.ts` | 1-30s    | test:slow, test:all   | Chaos, sync, heavy I/O |
| Mdtest   | `.test.md`      | <1s each | test:mdtest, test:all | CLI acceptance tests   |

### By Layer

| Layer   | Package          | Test Focus                       | Example Files              |
| ------- | ---------------- | -------------------------------- | -------------------------- |
| Parser  | `@km/markdown`   | Parse/serialize, roundtrip       | `markdown.test.ts`         |
| Storage | `@km/storage`    | CRUD, queries, sync, events      | `repo.test.ts`             |
| Tree    | `@km/tree`       | Tree queries, display names      | `queries.test.ts`          |
| Board   | `@km/board`      | Reducer state, selectors         | `board.test.ts`            |
| TUI     | `apps/km-tui`    | Component rendering, layout      | `board.spec.ts`            |
| CLI     | `apps/km-cli`    | Commands, workflows              | `navigation.test.md`       |
| Vendor  | `vendor/beorn-*` | Component behavior (inkx, flexx) | `vendor/beorn-inkx/tests/` |

### By Test Level

```
┌─────────────────────────────────────────────────────────┐
│  ACCEPTANCE TESTS (End-User Visible)                    │
├──────────────────────────┬──────────────────────────────┤
│  TUI (.spec.ts)          │  CLI (.test.md)              │
│  - Screen layout         │  - Command output            │
│  - Keyboard navigation   │  - Error messages            │
│  - Visual rendering      │  - Workflows                 │
└──────────────────────────┴──────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  CORE TESTS (.test.ts)                                  │
├──────────────────────────┬──────────────────────────────┤
│  Domain Tests            │  Pure Function Tests         │
│  - Repo CRUD/queries     │  - Parser logic              │
│  - Board state machine   │  - Tree queries              │
│  - Config loading        │  - Formatters                │
└──────────────────────────┴──────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  SYNC TESTS (Special)                                   │
├──────────────────────────┬──────────────────────────────┤
│  Chaos (.slow.test.ts)   │  Regression (.test.ts)       │
│  - Property-based        │  - Known bugs                │
│  - Find new bugs         │  - Fast execution            │
└──────────────────────────┴──────────────────────────────┘
```

---

## Migration History

### The Hybrid Era (Before January 2026)

**Problem**: Split test infrastructure with different capabilities.

**Old approach**:

- Vitest for packages without Bun APIs (`@km/tree`, `@km/board`, `@km/markdown`)
- Bun Test for packages needing `bun:sqlite` (`@km/storage`)
- Required JUnit-to-TAP conversion for Bun Test results
- Two different test syntaxes and behaviors

**Issues**:

1. **Complexity** - Different test runners for different packages
2. **Latency** - JUnit-to-TAP conversion delayed test feedback
3. **Inconsistency** - Slightly different APIs between Bun Test and Vitest
4. **Maintenance** - Two code paths to maintain

### The All-Vitest Migration (January 2026)

**Discovery**: Vitest can run on Bun runtime via `bunx --bun vitest`.

**Migration plan** (from `docs/testing/plan.md`, PATH 1):

**Phase 1: Migrate pure packages** ✅

- Packages without Bun-specific APIs (`@km/tree`, `@km/board`)
- Already using Vitest - no changes needed

**Phase 2: Migrate storage package** ✅

- `@km/storage` (uses `bun:sqlite` extensively)
- Updated test files to use Vitest syntax
- Verified `bun:sqlite` works with `bunx --bun vitest`

**Phase 3: Update test scripts** ✅

- Unified `scripts/test-all.ts` to use single Vitest runner
- Removed Bun Test producer from orchestrator
- Updated all package.json scripts

**Phase 4: Update configuration** ✅

- Consolidated `vitest.config.ts` for all packages
- Removed per-package test configuration
- Centralized test patterns in `test-patterns.ts`

**Phase 5: Documentation** (This document)

### Benefits Achieved

| Before (Hybrid)        | After (All-Vitest)    |
| ---------------------- | --------------------- |
| 2 test runners         | 1 test runner         |
| JUnit → TAP conversion | Native TAP streaming  |
| Different syntaxes     | Consistent Vitest API |
| Per-package configs    | Centralized config    |
| Slow test feedback     | Real-time streaming   |

---

## Implementation Details

### Vitest Configuration

**File**: `vitest.config.ts` (workspace root)

```typescript
export default defineConfig({
  test: {
    // All packages now use Vitest (migration complete)
    include: [
      "packages/*/tests/**/*.test.ts",
      "packages/*/tests/**/*.spec.ts",
      "packages/*/tests/**/*.test.md",
      "apps/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.spec.ts",
      "apps/*/tests/**/*.test.md",
      "apps/*/tests/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // Multiple reporters for CI integration
    reporters: ["tap", "html", "junit"],
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },

    // Package aliases for imports
    alias: {
      "@km/core": "./packages/km-core/src/index.ts",
      "@km/tree": "./packages/km-tree/src/index.ts",
      "@km/storage": "./packages/km-storage/src/index.ts",
      "@km/board": "./packages/km-board/src/index.ts",
      "@beorn/tap": "./vendor/beorn-tap/src/index.ts",
    },
  },
})
```

**Key points**:

- Single config for entire workspace
- Discovers tests in all packages and apps
- Supports `.test.md` via mdtest loader
- Multiple reporters (TAP, HTML, JUnit) for CI integration
- Package aliases resolve to source files (not built)

### Test Pattern Discovery

**File**: `scripts/test-patterns.ts`

Centralized source of truth for test file patterns. Used by:

- `scripts/run-tests.ts` (single test type)
- `scripts/test-all.ts` (unified TAP output)
- `scripts/test-all-tui.ts` (parallel TUI)

**Pattern matching**:

- Fast tests: Include `.test.ts` and `.spec.ts`, exclude `.slow.test.ts`
- Slow tests: Only `.slow.test.ts`
- Mdtest: Only `.test.md`

### TAP Producer

**File**: `vendor/beorn-tap/src/producers/vitest.ts`

```typescript
export function runVitestTap(options: VitestTapOptions = {}): VitestTapResult {
  const args = ["vitest", "run", "--reporter=tap", ...(options.args ?? [])]

  const proc = spawn(["bunx", "--bun", ...args], {
    cwd: options.cwd,
    stdout: "pipe", // Stream TAP output
    stderr: "inherit", // Show Vitest errors
  })

  return {
    stdout: proc.stdout, // Readable stream
    proc, // Subprocess handle
    exited: proc.exited, // Promise<number> for exit code
  }
}
```

**How it works**:

1. `bunx` resolves to installed `vitest` package
2. `--bun` forces Bun runtime (enables `bun:sqlite`)
3. `--reporter=tap` streams TAP format to stdout
4. `proc.stdout` is piped to TAP consumer
5. `proc.exited` resolves with exit code

### TAP Consumer

**File**: `vendor/beorn-tap/src/consumer.ts`

Parses TAP stream and displays results:

- `.` = test passed (green)
- `F` = test failed (red)
- `S` = test skipped (yellow)
- Summary: `517 tests, 1 failed, 516 passed`

**Usage** (`scripts/run-tests.ts`):

```typescript
const { stdout, exited } = runVitestTap({ args: files })
const consumer = createConsumer({ dots: true, output: process.stdout })

// Stream TAP output through consumer
for await (const chunk of stdout) {
  const text = new TextDecoder().decode(chunk)
  consumer.write(text)
}

consumer.end()
const results = consumer.getResults()
process.exit(results.failed > 0 ? 1 : await exited)
```

### Test Infrastructure Helpers

**In-memory database** (`@km/storage`):

- Default: `:memory:` SQLite (10-100x faster than disk)
- Exception: Worker thread tests (need disk for sharing)
- Environment: Isolated `/tmp/kmtest-{ulid}/` directories

**Test fixtures**:

- `withTestEnv()` - Provides isolated `{ db, repo, repoDir, kmDir }`
- `createFakeRepo()` - In-memory repo without real database
- Tree builders - `item()` creates nested hierarchy for TUI tests

**Example** (using in-memory database):

```typescript
test("creates node", async () => {
  await withTestEnv(async ({ db, repo, repoDir }) => {
    // Fresh :memory: database with schema
    // Isolated /tmp/kmtest-abc123/ directory
    const taskId = createTask(db, "Test task")
    expect(getNode(taskId)).toBeDefined()
  })
  // Auto cleanup: db closed, temp dir removed
})
```

---

## Future Improvements

### Native Bun TAP Support

**Status**: In progress - Bun PR [#23366](https://github.com/oven-sh/bun/pull/23366)

**What it adds**: Native `--reporter=tap` flag to Bun Test.

**Why it matters**:

- Current workaround requires JUnit → TAP conversion
- Native TAP would enable streaming without conversion
- Maintains compatibility with existing Bun-specific tests

**Impact on km**:

- Currently using all-Vitest approach (no change needed)
- Native Bun TAP would provide alternative if Vitest issues arise
- Having both options increases resilience

### Potential Optimizations

**Parallel test execution**:

- Vitest supports `--threads` flag for parallel execution
- Could reduce `test:fast` time from 11s to ~5s
- Requires investigation of test isolation

**Incremental testing**:

- Only run tests affected by changed files
- Vitest supports this via `--changed` flag
- Requires proper git integration

**Test result caching**:

- Cache results for unchanged files
- Skip tests that previously passed
- Vitest supports via `--cache-dir` and `--no-cache`

### Documentation Gaps

**Topics to expand**:

- Worker thread testing patterns
- Chaos testing scenarios
- Performance benchmarking
- CI/CD integration examples
- Debugging test failures

---

## Summary

The km test system achieves **simplicity through unification**:

1. **One test runner**: Vitest via `bunx --bun vitest`
2. **One runtime**: Bun (supports `bun:sqlite` and other APIs)
3. **One streaming format**: TAP (real-time feedback)
4. **One configuration**: `vitest.config.ts` for entire workspace
5. **One set of patterns**: `test-patterns.ts` for test discovery

**Developer workflow**:

- Iterate: `bun run test:fast` (~11s)
- Before commit: `bun run test:all` (~45s)
- Visual progress: `bun run test:all:tui` (parallel TUI)

**Key innovation**: Using `bunx --bun vitest` unlocks Vitest's mature framework while maintaining full access to Bun's native APIs. This eliminates the need for a hybrid test system and provides consistent, fast, streaming test feedback.

For detailed testing practices, see [testing.md](testing.md).
