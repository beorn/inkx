---
id: "@km/domain/10-add-vault-compatible-properties-to-repo-loaderrors"
aliases:
  - km-domain.10
  - km-domain-10
  - "@km/domain/10"
created_at: 2026-01-26T08:28:47Z
closed_at: 2026-01-26T17:42:05Z
assignee: beorn
---

# [x] Add Vault-compatible properties to Repo (loadErrors, stats, deferredFiles) @km/domain #task #P1 @beorn

Repo needs these properties to be a drop-in replacement for Vault:
- loadErrors: LoadError[] - errors from file parsing
- stats: VaultStats - nodeCount, linkCount, duration
- deferredFiles: DeferredFile[] - files for background parsing (discoverOnly mode)