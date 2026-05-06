---
mentions:
  - km
id: "@km/inbox/chaos-parallel"
aliases:
  - km-chaos-parallel
  - "@km/_orphan/chaos-parallel"
created_at: 2026-01-23T11:05:13Z
closed_at: 2026-01-23T14:41:50Z
---

# [x] Chaos testing: Multi-vault parallel test harness @km/_orphan #task #P2

Enable parallel chaos testing across multiple vaults.

## Implementation

```typescript
const results = await runChaosTestSuite({
  vaultCount: 10,
  scenarios: [SLOW_DISK, EVENT_STORM, QUEUE_OVERFLOW],
  parallel: true,
  onVaultComplete: (vault, result) => { /* ... */ }
});
```

## Benefits

- 10-100x speedup via parallelization
- Tests multi-user collaborative scenarios
- Catches inter-vault race conditions
- Better utilization of test resources

Location: packages/@km/storage/tests/sync/chaos/harness.ts

