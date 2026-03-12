---
description: Test-driven development for km. Use when writing tests, running test suites, fixing test failures, or following TDD workflow.
argument-hint: [fast|all|buffer|chaos]
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Testing

**Keywords**: test, TDD, bun test, test:fast, test:all, buffer assertions, chaos, silvery

## Workflows

All work follows the [test-first protocol](test-first-protocol.md).

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

**test:fast target: <20s wall-clock** (30s warning threshold allows for CPU contention).
If it exceeds 30s:
1. Something is wrong (hanging test, infinite loop, CPU contention)
2. Check `ps aux | grep vitest` for stale processes from other sessions
3. If a test hangs: find it with per-file runs, fix or mark `.slow.test.ts`
4. New TUI tests >5s should be `.slow.test.ts` — the fast suite is capped

### Why test:fast Is Fast

TUI board-rendering tests (testEnv + press + buffer assertions) dominate test time.
Files >5s are in `.slow.` to keep test:fast under 20s. The split:
- **test:fast** (~200 files, ~4200 tests, ~25s): unit tests, small TUI tests, CLI, storage, parsers
- **test:slow** (~40 files, ~1100 tests): heavy TUI navigation, rendering, incremental verification
- Both run in **test:all** before commit

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

**test:fast** runs the default project (non-slow, non-vendor). **test:all** runs all 3 projects. Fuzz files need `test:fuzz`.

**When iterating on a package**, run vitest directly on that directory:
```bash
bun vitest run vendor/silvery/tests/
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
| `test:fast`        | Default project (excludes `*.slow.*` and `vendor/**`)         | Fast feedback        |
| `test:slow`        | `--project slow` — `*.slow.{test,spec}.*` only                | Integration tests    |
| `test:all`         | `--project default --project slow --project vendor`           | Before commit        |
| `test:fuzz`        | `FUZZ=1` — `*.fuzz.ts` files only                             | Exploratory testing  |
| `test:vendor`      | `--project vendor` — vendor tests only                        | Vendor isolation     |
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
| **TUI Tests** | Component + board testing (silvery) | [tui.md](tui.md) |
| **Terminal Tests** | ANSI/cell/cursor verification (termless) | [termless.md](termless.md) |
| **CLI Tests** | Command output (mdtest) | [cli.md](cli.md) |
| **GUI/TTY Tests** | Screenshots (MCP/playwright) | [gui.md](gui.md) |
| **Fuzz (TUI)** | gen/take/test.fuzz (vimonkey) | [vimonkey CLAUDE.md](../../../vendor/vimonkey/CLAUDE.md) |
| **Exploration** | Chaos + monkey testing | [chaos.md](chaos.md), `/explore` |
| **Bench** | Benchmarks | [bench.md](bench.md) |
| **Storybook** | Interactive component catalog | `bun storybook` (inline), `--fullscreen` |

## Which Tool? Decision Tree

```
I want to test...
├── Component rendering / state / navigation
│   ├── km board behavior → testEnv() [tui.md]
│   └── Silvery component → createRenderer() [tui.md]
│
├── ANSI output correctness (colors, cursor, escape sequences)
│   ├── Silvery component → createTermless() [termless.md]
│   └── Spawned process → createTerminalFixture() + spawn() [termless.md]
│
├── Cross-emulator conformance (xterm vs Ghostty vs vt100)
│   └── Multi-backend workspace [termless.md]
│
├── CLI command output
│   └── mdtest (.test.md files) [cli.md]
│
├── Visual pixel verification / manual debugging
│   └── TTY MCP tools [gui.md]
│
└── Fuzz / chaos / property-based
    └── vimonkey (gen/take/test.fuzz) [chaos.md]
```

### Tool Comparison

| Tool | Import | Speed | Tests what | Use for |
|---|---|---|---|---|
| `createRenderer()` | `@silvery/test` | ~5ms | Virtual buffer (no ANSI) | Component logic, layout, text |
| `testEnv()` | km-tui helpers | ~200ms | Board state + virtual buffer | km navigation, board features |
| `createTermless()` | `@silvery/test` | ~10ms | Real xterm.js emulator | ANSI correctness, colors, cursor |
| `createTerminalFixture()` | `@termless/test` | ~5ms+ | xterm.js + auto-cleanup | Termless tests in vitest |
| `.spawn()` | Terminal method | 1-15s | Real PTY process | Integration / E2E |
| TTY MCP | `mcp__tty__*` | seconds | Browser screenshots | Visual debugging, pixel-level |

- Any **test** can have `.slow.` suffix (manually assigned)
- **Bench** and **Storybook** are not "tests" - must qualify
- See [testing.md#dynamic-testing-taxonomy](../../docs/dev/testing.md#dynamic-testing-taxonomy) for industry terminology

### Test File Organization

**Always add regression tests to existing thematic files.** The km-tui test suite is organized by domain (fold, zoom, scroll, etc.), not by bug ID. See [test-first-protocol.md](test-first-protocol.md#where-to-put-regression-tests) for the full domain→file mapping.

**Rules:**
1. Search for an existing file that matches your bug's domain before creating a new file
2. Only create a new file if: no domain match exists AND the test seeds 5+ related cases
3. Name new files by domain (`fold.test.ts`), not by bug (`fold-border-blank.test.ts`)
4. Group related tests under `describe()` blocks within the file

**Anti-pattern:** One file per bug (e.g., `fold-border-blank.test.ts`, `fold-border-regression.test.ts`). This causes test suite bloat — merge into `fold.test.ts` instead.

### Test File Suffixes

| Suffix          | What It Tests                   | Layer |
| --------------- | ------------------------------- | ----- |
| `.spec.ts`      | **User-level journeys** — keys in, observations out | km-tui (Layer 5) |
| `.test.ts`      | Unit/component/pipeline — internal API | All layers |
| `.slow.test.ts` | Heavy TUI tests (>5s), sync, real vault | Layers 3-5 |
| `.slow.spec.ts` | Heavy user-level journeys (>5s) | km-tui (Layer 5) |
| `.bench.ts`     | Performance measurement (vitest bench) | Any |
| `.fuzz.ts`      | Fuzz + chaos tests (excluded from test:all) | Any |
| `.test.md`      | CLI commands via mdtest         | km-cli |

**When to use `.spec.ts`**: If the test presses keys and asserts what the user sees + what got saved, use `.spec.ts`. If it calls internal functions or checks internal state, use `.test.ts`. See [test-layers.md](test-layers.md#when-suffix-should-be-spects-vs-testts) for details.

**Rules**:
- Tests taking >5s should be `.slow.test.ts` or `.slow.spec.ts`
- **Stress tests, large fixtures (100+ nodes), high iteration counts (100+), and performance measurements MUST be `.bench.ts`** — never `.test.ts` or `.slow.test.ts`. They run via `bun run bench`, not `test:all`.
- Ad-hoc debugging tests that aren't evergreen regression guards should be deleted, not committed

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

Single config at `vitest.config.ts` with 3 named projects:
- **`default`** — excludes `*.slow.*` and `vendor/**` (= fast tests)
- **`slow`** — only `*.slow.{test,spec}.*` files
- **`vendor`** — only `vendor/**`

Bare `vitest run` = default project only (fast). Use `--project` for others.
Reporter: `dot` (minimal). All imports use `vitest` (not `bun:test`), run with `bunx --bun`.

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
| Test layering philosophy     | [test-layers.md](test-layers.md)                |
| TUI testing (silvery)        | [tui.md](tui.md)                                |
| Terminal testing (termless)  | [termless.md](termless.md)                      |
| CLI testing (mdtest)         | [cli.md](cli.md)                                |
| GUI/TTY testing (MCP/screenshots) | [gui.md](gui.md)                           |
| Benchmarks                   | [bench.md](bench.md)                            |
| Chaos/fuzz testing sync      | [chaos.md](chaos.md)                            |
| Test quality review          | [review-tests.md](review-tests.md) (infrequent) |

**Full reference**: [docs/dev/testing.md](../../docs/dev/testing.md)
