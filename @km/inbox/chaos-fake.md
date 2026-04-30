---
id: "@km/inbox/chaos-fake"
aliases:
  - km-chaos-fake
  - "@km/_orphan/chaos-fake"
created_at: 2026-01-23T11:05:12Z
closed_at: 2026-01-23T11:37:10Z
---

# [x] FakeVault: Add chaos testing mode @km/_orphan #task #P2

Extend FakeVault with chaos-specific capabilities.

## Methods to add
- setNode/injectOrphan/injectDuplicate for state manipulation
- getTransactionLog/getOrphanedNodes/getDuplicates for inspection
- simulatePartialWrite/simulateCorruption for scenario triggers

## Benefit
Test reconciliation/dedup logic without full vault init.

Depends on: @km/_orphan/vault-fake