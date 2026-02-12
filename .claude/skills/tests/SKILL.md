---
description: Test-driven development for km. Use when writing tests, running test suites, fixing test failures, or following TDD workflow.
argument-hint: [fast|all|visual|chaos]
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Testing

**Keywords**: test, TDD, bun test, test:fast, test:all, visual testing, chaos, inkx

## Workflows

### Coding Iteration (every change)

```bash
bun run test:changed                  # Preferred: sub-second when focused on a few files
bun vitest related src/foo.ts         # Tests importing a specific file
bun vitest run apps/km-tui/tests/     # All tests in a directory
```

### Before Commit

```bash
bun fix                    # Lint + format (must pass)
bun run test:all           # Full suite (must pass) ~2-3min
```

### Timing Guard

**test:fast MUST complete in <15s wall-clock.** If it takes longer:
1. Something is wrong (hanging test, infinite loop, CPU contention)
2. Check `ps aux | grep vitest` for stale processes from other sessions
3. If a test hangs: find it with per-file runs, fix or mark `.slow.test.ts`
4. Create a P0 bead if test:fast regresses above 15s — this blocks all iteration

### Performance Analysis

```bash
bun run test:fast:html     # Fast tests + HTML report + perf tracking
bun run test:all:html      # All tests + HTML report + perf tracking
```

### Working on Specific Areas

| Working on...        | Run during iteration                    |
| -------------------- | --------------------------------------- |
| Current changes      | `bun run test:changed`                  |
| Specific changes     | `bun vitest run --changed`              |
| Specific file        | `bun vitest related src/foo.ts`         |
| Sync, watcher, chaos | `bun run test:slow`                     |
| Broad non-vendor     | `bun run test:fast`                     |

Still run `test:all` before commit.

### Efficient Test Verification

Dot reporter is the default (configured in vitest.config.ts) — one dot per test, details only on failure.

**test:fast** runs non-vendor tests only. **test:all** runs everything except `.fuzz.ts` files (use `test:fuzz` for those).

**When iterating on a package**, run vitest directly on that directory:
```bash
bun vitest run vendor/beorn-inkx/tests/
bun vitest run apps/km-tui/tests/
```

**If `test:all` fails:** fix using targeted vitest runs, then `test:all` one final time.

**Do NOT:**
- Re-run `test:all` to analyze a failure you already saw
- Pipe test output through grep (dot reporter handles this)
- Run full suites as "sanity checks" after targeted tests pass

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
| `test:all`         | All `*.{test,spec}.*` (`.fuzz.ts` excluded by convention)     | Before commit        |
| `test:fuzz`        | `*.fuzz.ts` files only                                        | Exploratory testing  |
| `test:vendor`      | Vendor tests only (`--project vendor`)                        | Vendor isolation     |
| `test:fast:html`   | Fast tests + HTML report + performance tracking               | Performance analysis |
| `test:all:html`    | All tests + HTML report + performance tracking                | Full analysis        |
| `test:changed`     | Changed files only (via vitest --changed)                     | Fastest iteration    |
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
| **Fuzz (TUI)** | gen/take/test.fuzz (vitestx) | [vitestx CLAUDE.md](../../../vendor/beorn-vitestx/CLAUDE.md) |
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
| `.slow.test.ts` | Heavy integration - sync        |
| `.fuzz.ts`      | Fuzz + chaos tests (excluded from test:all) |
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

## Vitest Config

Single unified config at `vitest.config.ts`:
- Reporter: `dot` (built-in, minimal output)
- setupFiles for console enforcement
- All test imports use `vitest` (not `bun:test`), all run with `bunx --bun`
- Vanilla `vitest run` works — scripts are thin wrappers with exclude patterns

## Output Rules

**km project tests must be silent on success.** Any stdout/stderr output fails the test.

- `console.log/info/debug` are intercepted and fail the test
- `process.stdout.write` is intercepted
- If your test needs output, use `vi.spyOn(console, "log").mockImplementation(() => {})`
- Debug with: `SKIP_OUTPUT_CHECK=1 bun test path/to/test.ts`

Vendor tests do not have console enforcement (they emit act() warnings from react-reconciler).

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
