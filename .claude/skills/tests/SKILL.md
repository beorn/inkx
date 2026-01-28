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
bun run test:fast          # ~11s - run after each change
```

### Before Commit

```bash
bun fix                    # Lint + format (must pass)
bun run test:all           # Full suite (must pass)
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

| Command     | What it runs                                                  |
| ----------- | ------------------------------------------------------------- |
| `test:fast` | `*.test.ts` + `*.spec.ts` + `*.test.md` (excludes `*.slow.*`) |
| `test:slow` | `*.slow.{test,spec}.{ts,tsx}` only                            |
| `test:all`  | All tests (via Vitest)                                        |

---

## Test Types

| Suffix          | What It Tests                   |
| --------------- | ------------------------------- |
| `.test.ts`      | Unit/integration - core logic   |
| `.spec.ts`      | TUI acceptance - user behavior  |
| `.slow.test.ts` | Heavy integration - chaos, sync |
| `.test.md`      | CLI commands via mdtest         |

**Rule**: Tests taking >1s should be `.slow.test.ts`

---

## TEST_MODE

Controls test infrastructure via environment variable.

| Mode      | Database | When to Use                         |
| --------- | -------- | ----------------------------------- |
| (default) | :memory: | Normal development                  |
| `mock`    | :memory: | Skip watcher tests (~20s faster)    |
| `real`    | Disk     | CI, releases, debugging disk issues |

Example: `TEST_MODE=mock bun run test:fast`

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

| Need                                 | Load                                            |
| ------------------------------------ | ----------------------------------------------- |
| TDD workflow, test safety            | [tdd-workflow.md](tdd-workflow.md)              |
| TUI visual testing (inkx, storybook) | [visual.md](visual.md)                          |
| Chaos/fuzz testing sync              | [chaos.md](chaos.md)                            |
| Test quality review                  | [review-tests.md](review-tests.md) (infrequent) |

**Full reference**: [docs/dev/testing.md](../../docs/dev/testing.md)
