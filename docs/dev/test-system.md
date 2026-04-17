# Test System Architecture

The km test system uses **Vitest's powerful testing framework** with **Bun's fast runtime and native APIs**. This document explains the architecture, how to run tests effectively, and how to use benchmarking and performance tracking features.

---

## Table of Contents

1. [Overview](#overview)
2. [Why Vitest with Bun Runtime?](#why-vitest-with-bun-runtime)
3. [Architecture](#architecture)
4. [Running Tests](#running-tests)
5. [Test Categories](#test-categories)
6. [Performance Tracking](#performance-tracking)
7. [Benchmarking](#benchmarking)
8. [Test Modes](#test-modes)
9. [Implementation Details](#implementation-details)

---

## Overview

**Key Principle**: All tests run via Vitest (`bunx --bun vitest`) with Bun as the runtime.

This unified approach gives us:

- Vitest's mature testing framework and reporters (HTML, JUnit)
- Bun's fast runtime and native APIs (`bun:sqlite`, `bun:ffi`, etc.)
- Automatic performance tracking and trending
- Single test runner for the entire codebase

---

## Why Vitest with Bun Runtime?

### The Problem with Pure Bun Test

Bun's built-in test runner lacks features we need:

- No HTML UI for test results
- Limited reporter options
- No built-in benchmarking support

### The Problem with Pure Vitest

Vitest runs on Node.js by default, which doesn't support Bun-specific APIs like:

- `bun:sqlite` - Used heavily in `@km/storage` for SQLite operations
- `bun:ffi` - Used for native integrations
- Bun's `Worker` implementation

Porting these to Node.js equivalents would require significant rewrites.

### The Solution: Vitest + Bun Runtime

Vitest can run on **any JavaScript runtime** by using `bunx --bun vitest`:

```bash
bunx --bun vitest run --reporter=dot --reporter=html --reporter=junit
```

**How it works**:

1. `bunx` downloads/runs `vitest` from npm
2. `--bun` flag forces Bun as the JavaScript runtime (not Node.js)
3. Vitest runs normally but with access to all Bun APIs
4. Multiple reporters generate different outputs (terminal, HTML, JUnit)

**Benefits**:

- ✅ Vitest's mature testing framework (describe, test, expect, etc.)
- ✅ HTML UI for visualizing test results and timing
- ✅ JUnit XML for CI integration
- ✅ Full access to Bun APIs (`bun:sqlite`, `bun:ffi`, `Worker`)
- ✅ Fast execution via Bun runtime
- ✅ Built-in benchmarking support
- ✅ Single test runner for entire codebase

---

## Architecture

### Component Stack

```
┌─────────────────────────────────────────────────────────┐
│  User Commands (package.json scripts)                   │
│  bun run test:fast, test:all (basic)                    │
│  bun run test:fast:html, test:all:html (with reports)   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Vitest (Test Framework)                                │
│  - Runs on Bun runtime (not Node.js)                    │
│  - Executes .test.ts, .spec.ts, .spec.md files          │
│  - Full access to bun:sqlite and other Bun APIs         │
│  - Optional HTML report + JUnit XML (:html commands)    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Performance Tracking (opt-in via :html commands)       │
│  packages/km-infra/scripts/test-perf/track.ts                               │
│  - Reads vitest metadata from HTML report               │
│  - Tracks performance over time                         │
│  - Identifies slow tests and regressions                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Outputs                                                │
│  - Terminal: Dot reporter (always)                      │
│  - HTML: test-results/vitest-report.html (:html only)   │
│  - JUnit: test-results/junit.xml (:html only)           │
│  - Performance history: .test-results/test-perf-history.│sonl (:html only) │
└─────────────────────────────────────────────────────────┘
```

### Reporters

The test system uses reporters configured via CLI flags:

1. **Dot Reporter** (`--reporter=dot`) - Terminal output with concise dots (. = pass, x = fail) - Always enabled
2. **HTML Reporter** (`--reporter=html`) - Interactive UI at `test-results/vitest-report.html` - Opt-in via `:html` commands
3. **JUnit Reporter** (`--reporter=junit`) - XML output for CI systems - Opt-in via `:html` commands

Configuration in `vitest.config.ts`:

```typescript
// Reporters configured via CLI flags (see package.json scripts)
// Use test:fast:html or test:all:html for HTML reports and performance tracking
outputFile: {
  html: "./test-results/vitest-report.html",
  junit: "./test-results/junit.xml",
}
```

---

## Running Tests

### Quick Reference

| Command                    | What it runs                             | Duration | Use case             |
| -------------------------- | ---------------------------------------- | -------- | -------------------- |
| `bun run test:fast`        | `.test.ts` + `.spec.ts` (excludes slow)  | ~13s     | Default iteration    |
| `bun run test:slow`        | `.slow.test.ts` only                     | ~30s     | Sync/chaos iteration |
| `bun run test:all`         | All tests                                | ~45s     | Before commit        |
| `bun run test:fast:html`   | Fast tests + HTML report + perf tracking | ~13s     | Performance analysis |
| `bun run test:all:html`    | All tests + HTML report + perf tracking  | ~45s     | Full perf analysis   |
| `bun run test:fast:serial` | Fast tests without parallelization       | ~20s     | Accurate timing      |

### Detailed Commands

#### `bun run test:fast` (Default)

Runs all fast tests (excludes `.slow.test.ts` files). This is your main iteration loop.

```bash
bun run test:fast
```

**Output:**

- Terminal: Dot progress (·····)

For HTML reports and performance tracking, use `test:fast:html` instead.

**When to use:**

- Default for local development
- Quick feedback loop
- Verifying changes

#### `bun run test:slow`

Runs only `.slow.test.ts` files (chaos tests, sync tests, etc.).

```bash
bun run test:slow
```

**When to use:**

- Testing sync/watcher behavior
- Running chaos tests
- Before committing changes to storage layer

#### `bun run test:all`

Runs all tests (fast + slow).

```bash
bun run test:all
```

**When to use:**

- Before committing
- Before pushing
- Final validation before PR

#### `bun run test:fast:html`

Runs fast tests with HTML report generation and automatic performance tracking.

```bash
bun run test:fast:html
```

**Output:**

- Terminal: Dot progress
- HTML report: `test-results/vitest-report.html`
- JUnit XML: `test-results/junit.xml`
- Performance summary and trends

**When to use:**

- Analyzing test performance
- Identifying slow tests
- Tracking performance trends
- Generating reports for CI

#### `bun run test:fast:serial`

Runs fast tests sequentially (no parallelization). Gives accurate per-test timing but slower overall.

```bash
bun run test:fast:serial
```

**When to use:**

- Measuring test performance accurately
- Debugging timing-sensitive tests
- Comparing performance across runs

### Viewing Test Results

After running tests, view the HTML UI:

```bash
npx vite preview --outDir test-results
```

Then open http://localhost:4173 to see:

- Per-test timing
- Test file organization
- Interactive filtering
- Historical comparisons

---

## Test Categories

### By Speed

Tests are categorized by execution speed to optimize the development feedback loop.

#### Fast Tests (`.test.ts`, `.spec.ts`)

- **Target**: < 1 second per file
- **Examples**: Unit tests, simple integration tests
- **Location**: `packages/**/tests/**/*.test.ts`

```typescript
// packages/km-tree/tests/queries.test.ts
describe("Tree queries", () => {
  test("getNodeAtPath", () => {
    // Fast, focused test
  })
})
```

#### Slow Tests (`.slow.test.ts`)

- **Target**: > 1 second per file
- **Examples**: Sync tests, chaos tests, file system integration
- **Location**: `packages/**/tests/**/*.slow.test.ts`

```typescript
// packages/km-storage/tests/sync.slow.test.ts
describe("Sync manager", () => {
  test("handles rapid file changes", async () => {
    // Slow integration test
  })
})
```

**When to mark a test as slow:**

- File takes > 1 second to execute
- Tests involve file system I/O
- Tests involve real database operations
- Tests involve timing/delays

### By Type

#### Unit Tests

Test individual functions/classes in isolation.

```typescript
describe("parseMarkdown", () => {
  test("parses task list", () => {
    const result = parseMarkdown("- [ ] Task")
    expect(result.children).toHaveLength(1)
  })
})
```

#### Integration Tests

Test multiple components working together.

```typescript
describe("Repo sync", () => {
  test("syncs file changes to database", async () => {
    const repo = await createFakeRepo()
    repo.write("file.md", "# Content")
    await repo.sync()
    expect(repo.getAllNodes()).toHaveLength(1)
  })
})
```

#### Markdown Tests (`.spec.md`)

Executable markdown tests for CLI commands and end-to-end flows.

```markdown
# Test: Create and list tasks

$ km add "New task"
Created: New task

$ km list

- [ ] New task
```

---

## Performance Tracking

Performance tracking is available via the `:html` test commands (`test:fast:html`, `test:all:html`).

### How It Works

1. **Tests run** - Vitest generates HTML metadata (`test-results/html.meta.json.gz`)
2. **Track script runs** - `packages/km-infra/scripts/test-perf/track.ts` reads metadata
3. **History stored** - Performance data appended to `.test-results/test-perf-history.jsonl`
4. **Summary displayed** - Shows slowest files, regressions, trends

### Performance Summary

After `bun run test:fast:html`:

```
============================================================
📊 Test Performance Summary
============================================================

⏱️  Total: 13.2s (2292 tests, 107 files)
   Avg per test: 5.8ms
   Avg per file: 123ms
   📉 2.1% faster than previous run (13.5s)

🐌 Slowest Files (top 5):
   1. packages/km-storage/tests/repo.test.ts
      2.1s (45 tests)
   2. packages/km-storage/tests/sync.test.ts
      1.8s (32 tests)
   3. apps/km-tui/tests/board.spec.ts
      1.2s (28 tests)

⚠️  2 file(s) taking >1000ms should be .slow.test.ts:
   - packages/km-storage/tests/repo.test.ts (2.1s)
   - packages/km-storage/tests/sync.test.ts (1.8s)

📈 Historical Trend (last 5 runs):
     1/25/2026, 10:30:12 AM: 13.5s (2292 tests)
     1/25/2026, 11:15:45 AM: 13.3s (2292 tests)
     1/25/2026, 2:20:33 PM: 13.8s (2295 tests)
     1/26/2026, 9:45:22 AM: 13.4s (2295 tests)
   → 1/27/2026, 10:48:30 PM: 13.2s (2292 tests)

============================================================
```

### Interpreting Results

**Regression Warnings:**

- 🟡 Yellow (>5% slower): Minor slowdown, investigate if consistent
- 🔴 Red (>10% slower): Significant regression, investigate immediately

**Slow File Candidates:**

- Files taking >1s should be moved to `.slow.test.ts`
- Rename: `foo.test.ts` → `foo.slow.test.ts`
- Update imports if needed

**Historical Trends:**

- Look for consistent slowdowns over multiple runs
- Correlate with recent changes
- Use `git bisect` to find problematic commits

### Manual Performance Analysis

View detailed timing in HTML UI:

```bash
bun run test:fast
npx vite preview --outDir test-results
```

Navigate to slowest files and inspect per-test timing.

---

## Benchmarking

For measuring system performance (not test performance), use benchmarks.

### Running Benchmarks

```bash
# Run all benchmarks
bun run bench

# Create baseline for comparison
bun run bench:baseline

# Compare against baseline
bun run bench:compare
```

### Benchmark Files

Benchmarks are located in `benchmarks/`:

- `layout.bench.ts` - Flexily layout computation performance
- `parser.bench.ts` - Markdown parsing/serialization

### Writing Benchmarks

Use Vitest's `bench()` API:

```typescript
import { bench, describe, beforeAll } from "vitest"

describe("Parser Performance", () => {
  let largeDoc: string

  beforeAll(() => {
    largeDoc = generateLargeDocument(1000) // 1000 items
  })

  bench("parse large document", () => {
    parseMarkdown(largeDoc)
  })
})
```

### Benchmark Output

```
 BENCH  Summary

  Parse flat list (100 items)
    15,330 ops/sec
    ± 1.22%
    65.2 μs/op

  Parse large document (1000 items)
    1,523 ops/sec
    ± 2.15%
    656.8 μs/op
```

**Note:** You may see "NaNx faster than" in comparisons - this occurs when benchmarks run extremely fast (sub-microsecond). The actual timing data (Hz, mean) is still valid and useful.

### Baseline Comparison

After establishing a baseline:

```bash
bun run bench:compare
```

Output shows performance relative to baseline:

```
  Parse flat list (100 items)
    1.05x faster than baseline

  Parse large document (1000 items)
    0.92x slower than baseline (⚠️ 8% regression)
```

---

## Test Modes

The storage layer supports test modes via `TEST_MODE` environment variable.

### `standard` (Default)

- **Database**: `:memory:` (in-memory SQLite)
- **Filesystem**: `/tmp` directory
- **Use case**: Fast iteration, good fidelity
- **Speed**: ⚡⚡⚡

```bash
bun run test:fast
# or explicitly:
TEST_MODE=standard bun run test:fast
```

### `mock`

- **Database**: `:memory:` (in-memory SQLite)
- **Filesystem**: `/tmp` directory
- **Use case**: Reserved for future optimization
- **Speed**: ⚡⚡⚡

> **Note**: Currently identical to `standard` mode. The `isMockMode()` function exists but no tests currently use it to skip. This mode is reserved for future optimization where slow tests could skip via `test.skipIf(isMockMode())`.

```bash
TEST_MODE=mock bun run test:fast
```

### `real`

- **Database**: Disk-based (`/tmp/.km/state.db`)
- **Filesystem**: `/tmp` directory
- **Use case**: Drift detection, CI, debugging disk-specific issues
- **Speed**: ⚡⚡

```bash
TEST_MODE=real bun run test:all
```

### Test Mode Philosophy

**"If fake didn't fail but real failed, update fake to make it more realistic"**

- `standard` mode should catch 99% of bugs
- `real` mode catches disk I/O, file descriptor, concurrency edge cases
- If `real` mode finds a bug, add a test that catches it in `standard` mode

### Fakes vs Test Modes

Test modes control the `withTestEnv()` infrastructure. Behavioral fakes like `createFakeRepo()` work independently of TEST_MODE. See [test-fakes.md](test-fakes.md) for the complete fakes inventory.

---

## Implementation Details

### Test Configuration

`vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    // Test files
    include: ["**/*.{test,spec}.{ts,tsx,md}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/vendor/**"],

    // Benchmark configuration
    benchmark: {
      include: ["**/*.bench.{ts,tsx}"],
    },

    // Parallel execution
    maxWorkers: Math.max(availableParallelism() - 1, 1),
    fileParallelism: true,

    // Reporters
    reporters: ["html", "junit"],
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },
  },
})
```

### Package.json Scripts

```json
{
  "test:fast": "NO_COLOR=1 bunx --bun vitest run --reporter=dot --exclude='**/*.slow.*'",
  "test:slow": "NO_COLOR=1 bunx --bun vitest run --reporter=dot -- '**/*.slow.{test,spec}.{ts,tsx,md}'",
  "test:all": "NO_COLOR=1 bunx --bun vitest run --reporter=dot",
  "test:fast:html": "NO_COLOR=1 bunx --bun vitest run --reporter=dot --reporter=html --reporter=junit --exclude='**/*.slow.*' && bun packages/km-infra/scripts/test-perf/track.ts",
  "test:all:html": "NO_COLOR=1 bunx --bun vitest run --reporter=dot --reporter=html --reporter=junit && bun packages/km-infra/scripts/test-perf/track.ts",
  "bench": "bunx --bun vitest bench",
  "bench:baseline": "bunx --bun vitest bench --outputJson benchmarks/baseline.json",
  "bench:compare": "bunx --bun vitest bench --compare benchmarks/baseline.json"
}
```

### File Organization

```
km/
├── packages/*/tests/          # Package tests
│   ├── *.test.ts             # Fast unit/integration tests
│   ├── *.slow.test.ts        # Slow integration tests
│   └── *.spec.md             # Markdown executable tests
├── apps/*/tests/              # App tests (same structure)
├── benchmarks/                # System benchmarks
│   ├── layout.bench.ts
│   ├── parser.bench.ts
│   ├── queries.bench.ts
│   ├── sync.bench.ts
│   └── baseline.json          # Baseline for comparisons
├── packages/km-infra/scripts/test-perf/  # Performance tracking tool
│   └── track.ts
├── test-results/              # Generated test outputs
│   ├── vitest-report.html    # HTML UI
│   ├── html.meta.json.gz     # Vitest metadata
│   └── junit.xml             # JUnit XML
└── .test-results/             # Performance history
    └── test-perf-history.jsonl
```

### Test Quality Enforcement

`tests/vitest-setup.ts` enforces test quality:

```typescript
// Fail tests on any console output
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {
    throw new Error("console.log() in test - use expect() instead")
  })
})
```

This ensures tests are:

- Silent (no console pollution)
- Deterministic (no debug output)
- Focused (explicit assertions)

---

## Further Reading

- [Vitest Configuration](../dev/vitest-ci.md) - CI integration details
