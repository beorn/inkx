---
description: Test-driven development workflow for km
---

# Testing Workflow

**Keywords**: test, testing, TDD, test-driven, bun test, test:fast, test:all

**Full reference**: [docs/dev/testing.md](../../../docs/dev/testing.md)

---

## Quick Reference

```bash
bun run test:fast    # Fast iteration (~11s) - use frequently
bun run test:all     # Full suite (~2min) - before commit
bun fix              # Lint + format - must pass before commit
```

**⚠️ NEVER use bare `bun test`** - picks up archived tests.

---

## Development Workflow

**During iteration:**

```bash
bun vitest run --changed              # Fastest: affected tests only
bun vitest related src/foo.ts         # Tests for specific source file
bun vitest run apps/km-tui/tests/     # All tests in a directory
```

**Before committing:**

```bash
bun fix              # MUST pass
bun run test:all     # MUST pass
```

**TDD cycle:**

1. Write failing test
2. Implement feature
3. `test:fast` passes
4. `bun fix` passes
5. `test:all` passes
6. Commit

---

## Test Types

| Type             | Suffix                 | Use Case                   |
| ---------------- | ---------------------- | -------------------------- |
| Fast unit        | `.test.ts`             | Core logic, pure functions |
| Slow integration | `.slow.test.ts`        | Real DB, workers           |
| Spec/acceptance  | `.spec.ts`, `.test.md` | UI behavior, CLI           |
| Chaos            | `chaos/*.test.ts`      | Sync edge cases            |

**Target**: `test:fast` <15 seconds. If >15s, something is wrong — create P0 bead. Move slow tests to `.slow.test.ts`.

---

## Test Safety

**CRITICAL: Use isolated directories**

- Tests use `/tmp/kmtest-*` (auto-cleaned)
- NEVER test on real user data
- `km sync --to-fs` can corrupt files - always isolate

```bash
# Safe manual testing
rm -rf /tmp/test-repo && mkdir -p /tmp/test-repo
echo -e "# Test\n- [ ] Task 1" > /tmp/test-repo/test.md
bun km view /tmp/test-repo
```

---

## Spec Tests

Acceptance tests at outermost level:

- **TUI**: `board.spec.ts` - CSS selectors, interactions
- **CLI**: `km-*.test.md` - shell commands via mdtest
- Run with `TEST_MODE=mock bun run test:fast` to skip watcher tests (~20s faster)
