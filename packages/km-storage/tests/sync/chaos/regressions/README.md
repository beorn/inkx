# Chaos Regression Scenarios

Regression cases are now managed automatically by vitestx.

## How It Works

When a `test.fuzz` test fails, vitestx:

1. **Shrinks** the failing event sequence to a minimal reproduction
2. **Saves** the shrunk case to `__fuzz_cases__/` adjacent to the test file
3. **Replays** saved cases automatically on subsequent test runs

## Reproducing a Failure

```bash
# Reproduce with a specific seed
FUZZ_SEED=12345 bun test packages/km-storage/tests/sync/chaos/chaos-fuzz.slow.test.ts
```

## Legacy

This directory previously held manually-saved regression scenarios in markdown
with YAML frontmatter. The old `regression.slow.test.ts` and `scripts/chaos.ts`
infrastructure has been replaced by vitestx's `test.fuzz` + `gen()`/`take()`.
