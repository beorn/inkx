---
description: Test-driven development workflow for km
---

# Testing Workflow

**Keywords**: test, testing, TDD, test-driven, bun test, test:fast, test:all

**Full reference**: [docs/dev/testing.md](../../../docs/dev/testing.md)

---

## Quick Reference

See [SKILL.md](SKILL.md) for all test commands.

Follow the [test-first protocol](test-first-protocol.md).

---

## TDD Cycle

1. Write failing test (test-first protocol)
2. Implement feature
3. `test:fast` passes
4. `bun fix` passes
5. `test:all` passes
6. Clean up: if the test is worth keeping, rename it to a descriptive `.test.ts` name. If it was ad-hoc investigation, either delete it or rename to `.scratch.ts` (not picked up by vitest).
7. Commit

---

## Test Types

| Type             | Suffix                 | Use Case                   |
| ---------------- | ---------------------- | -------------------------- |
| Fast unit        | `.test.ts`             | Core logic, pure functions |
| Slow integration | `.slow.test.ts`        | Real DB, workers           |
| Spec/acceptance  | `.spec.ts`, `.test.md` | UI behavior, CLI           |
| Chaos            | `chaos/*.test.ts`      | Sync edge cases            |
| Ad-hoc/scratch   | `.scratch.ts`          | Temporary investigation    |

**Scratch vs test**: Useful tests that verify behavior belong in the suite as `.test.ts`. Ad-hoc investigation/debugging files use `.scratch.ts` — vitest ignores them (include pattern: `*.{test,spec}.*`). Always decide: is this test worth keeping? If yes → `.test.ts`. If throwaway → `.scratch.ts`.

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
