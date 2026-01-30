---
description: CLI testing with mdtest - command output testing
---

# CLI Tests (mdtest)

Command output testing via mdtest vitest plugin.

**Keywords**: CLI test, mdtest, command output, km-repl

---

## When to Use

- Testing CLI commands (`km list`, `km view`, etc.)
- Always acceptance-level (user-facing)

---

## File Pattern

- `*.test.md` - Fast CLI tests
- `*.slow.test.md` - Slow CLI tests (subprocess, real I/O)

---

## Configuration (REQUIRED)

```yaml
---
mdtest:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true # ← CRITICAL: Use in-memory database
---
```

**The `memory: true` flag is required for fast tests.** Without it:
- Uses disk database
- 16x slower (190ms vs 12ms per command)
- Creates unnecessary I/O

---

## Example Test

```markdown
# Navigation Test

## Setup

$ km sync
✓ Synced ...

## Test

$ km sh board.md -c 'j; state'
cursor: [1]
```

---

## How It Works

1. km-repl plugin creates isolated `/tmp/kmtest-*` directory
2. `memory: true` sets `KM_DB_PATH=:memory:` environment
3. `executeKmCommand()` runs km commands in-process (no subprocess)
4. Plugin cleans up temp directory after all tests

---

## When to Use Subprocess Instead

Use subprocess (`$ bun km ...`) only when testing:
- CLI exit codes
- Environment variable handling
- Actual binary execution

These tests should be in separate `.slow.test.md` files.

---

## Doctrine

mdtest asserts semantic output, not formatting or layout. Don't assert spacing, ANSI colors, or cursor position in mdtest.

---

## Location

`apps/km-cli/tests/sh/*.test.md`

---

## See Also

- [mdtest README](../../vendor/beorn-mdtest/README.md)
