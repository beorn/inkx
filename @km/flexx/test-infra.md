---
id: "@km/flexx/test-infra"
aliases:
  - km-flexx.test-infra
  - km-flexx-test-infra
created_by: claude:b509d761
created_at: 2026-02-10T12:01:21Z
closed_at: 2026-02-10T12:11:27Z
owner: bjorn@stabell.org
assignee: claude:b509d761
---

# [x] Flexx re-layout testing infrastructure: instrumented mode + mutation testing @km/flexx #task #P2 @claude:b509d761

Build permanent testing infrastructure for detecting and diagnosing incremental re-layout bugs in Flexx.

1. Instrumented layout mode — debug flag that records every fingerprint decision, cache hit/miss, and parent override. Can diff two passes to find divergence points.
2. Additional property invariants in fuzz: idempotency, structural sanity
3. Cache code path coverage verification
4. Extended fuzz seeds (10K for CI nightly)

Based on deep research findings (Chrome LayoutNG chain-of-10-bugs precedent, property-based testing patterns). See session for full analysis.