---
description: Test-driven development for km. Use when writing tests, running test suites, or following TDD workflow.
argument-hint: [fast|all|visual|chaos]
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Testing

**Keywords**: test, TDD, bun test, test:fast, test:all, visual testing, chaos, inkx

## Workflows

### Coding Iteration (every change)

```bash
bun run test:fast          # ~20s - run after each change
```

### Before Commit

```bash
bun fix                    # Lint + format (must pass)
bun run test:all           # Full suite (must pass) ~2-3min
```

### Performance Analysis

```bash
bun run test:fast:html     # Fast tests + HTML report + perf tracking
bun run test:all:html      # All tests + HTML report + perf tracking
```

### Working on Specific Areas

| Working on...        | Run during iteration |
| -------------------- | -------------------- |
| Sync, watcher, chaos | `bun run test:slow`  |
| Everything else      | `bun run test:fast`  |

Still run `test:all` before commit.

### CI / Release

```bash
TEST_MODE=real bun run test:all   # Disk DB, full infrastructure
```

**NEVER use bare `bun test`** - picks up archived tests.

---

## Test Commands

| Command            | What it runs                                                  | Notes                |
| ------------------ | ------------------------------------------------------------- | -------------------- |
| `test:fast`        | `*.test.ts` + `*.spec.ts` + `*.test.md` (excludes `*.slow.*`) | Fast feedback        |
| `test:slow`        | `*.slow.{test,spec}.{ts,tsx}` only                            | Integration tests    |
| `test:all`         | All tests (via Vitest)                                        | Before commit        |
| `test:fast:html`   | Fast tests + HTML report + performance tracking               | Performance analysis |
| `test:all:html`    | All tests + HTML report + performance tracking                | Full analysis        |
| `test:fast:serial` | Fast tests without parallelization                            | Accurate timing      |

## Benchmark Commands

| Command          | What it does                   | Use case            |
| ---------------- | ------------------------------ | ------------------- |
| `bench`          | Run all benchmarks             | Measure performance |
| `bench:baseline` | Create baseline for comparison | After optimization  |
| `bench:compare`  | Compare against baseline       | Detect regressions  |

---

## Testing Categories

| Category | What | Skill |
|----------|------|-------|
| **TUI Tests** | Term buffer (inkx) | [tui.md](tui.md) |
| **CLI Tests** | Command output (mdtest) | [cli.md](cli.md) |
| **GUI Tests** | Screenshots (ttyd/playwright) | [gui.md](gui.md) |
| **Fuzz (TUI)** | gen/take/test.fuzz (vitestx) | [vendor/beorn-vitestx/CLAUDE.md] |
| **Exploration** | Chaos + monkey testing | [chaos.md](chaos.md), `/explore` |
| **Bench** | Benchmarks | [bench.md](bench.md) |
| **Storybook** | Static component rendering | `bun storybook` |

- Any **test** can have `.slow.` suffix (manually assigned)
- **Bench** and **Storybook** are not "tests" - must qualify
- See [testing.md#dynamic-testing-taxonomy](../../docs/dev/testing.md#dynamic-testing-taxonomy) for industry terminology

### Test File Suffixes

| Suffix          | What It Tests                   |
| --------------- | ------------------------------- |
| `.test.ts`      | Unit/component - core logic     |
| `.spec.ts`      | TUI acceptance - user behavior  |
| `.slow.test.ts` | Heavy integration - chaos, sync |
| `.test.md`      | CLI commands via mdtest         |

**Rule**: Tests taking >1s should be `.slow.test.ts`

---

## TEST_MODE

Controls test infrastructure via environment variable.

| Mode      | Database | When to Use                   |
| --------- | -------- | ----------------------------- |
| (default) | :memory: | Normal development            |
| `real`    | Disk     | CI, releases, drift detection |

Example: `TEST_MODE=real bun run test:all`

> **Note**: `mock` mode exists but doesn't currently skip tests. See [test-fakes.md](../../docs/dev/test-fakes.md) for behavioral fakes that work independently of TEST_MODE.

---

## Performance Tracking

Use `:html` commands for performance tracking and HTML reports:

```
============================================================
📊 Test Performance Summary
============================================================

⏱️  Total: 13.2s (2292 tests, 107 files)
   Avg per test: 5.8ms
   📉 2.1% faster than previous run

🐌 Slowest Files (top 5):
   1. packages/km-storage/tests/repo.test.ts
      2.1s (45 tests)

⚠️  2 file(s) taking >1000ms should be .slow.test.ts:
   - packages/km-storage/tests/repo.test.ts (2.1s)
```

**What to do:**

- Files >1s should be moved to `.slow.test.ts`
- > 10% regression: investigate immediately
- View HTML UI: `bunx vite preview --outDir test-results`

---

## Output Rules

**Tests must be silent on success.** Any stdout/stderr output fails the test.

- `console.log/info/debug` are intercepted and fail the test
- `process.stdout.write` is intercepted
- If your test needs output, use `spyOn(console, "log").mockImplementation(() => {})`
- Debug with: `SKIP_OUTPUT_CHECK=1 bun test path/to/test.ts`

See [docs/dev/testing.md](../../docs/dev/testing.md#test-output-rules) for details.

---

## Sub-Skills

| Need                         | Load                                            |
| ---------------------------- | ----------------------------------------------- |
| TDD workflow, test safety    | [tdd-workflow.md](tdd-workflow.md)              |
| TUI testing (inkx)           | [tui.md](tui.md)                                |
| CLI testing (mdtest)         | [cli.md](cli.md)                                |
| GUI testing (ttyd/playwright)| [gui.md](gui.md)                                |
| Benchmarks                   | [bench.md](bench.md)                            |
| Chaos/fuzz testing sync      | [chaos.md](chaos.md)                            |
| Test quality review          | [review-tests.md](review-tests.md) (infrequent) |

**Full reference**: [docs/dev/testing.md](../../docs/dev/testing.md)
