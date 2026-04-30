---
id: "@km/inbox/chaos-hooks"
aliases:
  - km-chaos-hooks
  - "@km/_orphan/chaos-hooks"
created_at: 2026-01-23T11:05:00Z
closed_at: 2026-01-23T12:50:11Z
---

# [x] Chaos testing: Integrate with Vault lifecycle hooks @km/_orphan #task #P2

Use @km/_orphan/vault-plugins hooks for application-level chaos injection.

## Goal
Enable failure injection at the Vault layer, not just filesystem:
- Event drops/corruption during apply
- Stale/empty query results
- Partial writes to database

## Example
```typescript
using vault = runGenerator(createVault(path, {
  hooks: {
    beforeMutation: (mutation) => {
      if (random() < 0.1) return null;  // 10% drop
      return mutation;
    },
    afterQuery: (result) => {
      if (random() < 0.05) return [];  // Stale read
      return result;
    }
  }
}));
```

## Scenarios enabled
- Database corruption during event replay
- Partial transaction failures
- Query result inconsistency
- These can't be tested via ChaosWatcher (FS-only)

Depends on: @km/_orphan/vault-plugins