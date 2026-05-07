---
mentions:
  - km
id: "@km/domain/11-add-refresh-and-needsrebuild-methods-to-repo"
aliases:
  - km-domain.11
  - km-domain-11
  - "@km/domain/11"
created_at: 2026-01-26T08:28:48Z
closed_at: 2026-01-26T08:36:49Z
---

# [x] Add refresh() and needsRebuild() methods to Repo @km/domain #task #P2

Repo needs these methods for feature parity with Vault:

- refresh(): Re-scans filesystem (memory) or re-applies events (disk)
- needsRebuild(): Checks if state.db needs rebuild by comparing events

