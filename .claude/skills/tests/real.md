# Real Infrastructure Testing

Run tests against real infrastructure (disk-based SQLite) to detect drift from in-memory fakes.

## When to Use

- **Periodically** (weekly, before releases)
- **After changing storage/sync code** that might behave differently on disk
- **When debugging issues** that only appear in production
- **Before major releases** to ensure fakes match reality

## Workflow

### 1. Run Tests with Real Infrastructure

```bash
# Run all tests with disk-based DB
TEST_MODE=real bun run test:all

# Run specific package
TEST_MODE=real bun run test:all -- packages/km-storage

# Run benchmarks (always use real - benchmarks need real infra)
bun run bench
```

### 2. Compare Results

If tests pass with default (memory) but fail with `TEST_MODE=real`:

1. **Identify the failing test** - Note which specific behavior differs
2. **Understand the difference** - Is it timing? File locking? DB behavior?
3. **Fix the fake** - Update the fake to be more realistic
4. **Add regression test** - Ensure this drift is caught in default mode going forward

### 3. Document Findings

If you discover drift, document it in the test file:

```typescript
// Regression: Disk DB requires explicit transaction commit
// Discovered via TEST_MODE=real run on 2026-01-15
test("commits transaction on close", async () => {
  // ...
})
```

## Drift Detection Scenarios

### Fake Passes, Real Fails

**Diagnosis**: The fake is too permissive - it allows behavior that real infrastructure rejects.

**Fix**: Update the fake to match real constraints:

- Add validation that real DB enforces
- Add timing constraints that disk I/O introduces
- Add error conditions that memory doesn't trigger

### Fake Fails, Real Passes

**Diagnosis**: The fake is too strict - it rejects behavior that real infrastructure allows.

**Fix**: Update the fake to be more permissive:

- Remove overly strict validation
- Allow concurrent operations the real system supports
- Accept edge cases the real system handles

## Common Drift Causes

| Category                  | Example                                   | Detection                         |
| ------------------------- | ----------------------------------------- | --------------------------------- |
| **Timing**                | Race conditions masked by memory speed    | Real mode exposes timing issues   |
| **File locks**            | Concurrent access works in memory         | Real mode shows lock contention   |
| **Transaction semantics** | Memory doesn't enforce ACID fully         | Real mode enforces DB constraints |
| **Resource limits**       | Memory doesn't hit file descriptor limits | Real mode can exhaust resources   |
| **Error paths**           | Memory rarely fails                       | Real mode triggers I/O errors     |

## Benchmarks Always Use Real

Benchmarks measure actual performance, so they must use real infrastructure:

```bash
# Always uses real fs/db
bun run bench

# Create baseline for comparison
bun run bench:baseline

# Compare against baseline
bun run bench:compare
```

See `benchmarks/*.bench.ts` for benchmark implementations.

## See Also

- [test-fakes.md](../../docs/dev/test-fakes.md) - Fakes inventory
- [testing.md](../../docs/dev/testing.md) - Main testing guide
- [test-system.md](../../docs/dev/test-system.md) - Test system architecture
