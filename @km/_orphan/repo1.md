---
id: "@km/_orphan/repo1"
aliases:
  - km-repo1
created_at: 2026-01-26T10:30:00Z
closed_at: 2026-01-26T12:43:11Z
---

# [x] Vault→Repo terminology migration - incomplete @km/_orphan #task #P1 @claude-opus-4-5

## Completed

**Migration done:**
- 1100 edits across 68 files using automated refactor tool
- Case-preserving: vaultDir→repoDir, VaultStats→RepoStats, VAULT_DIR→REPO_DIR
- Fixed migration-related type errors

**Intentionally kept (deprecated backward-compat exports):**
- vaultPath, createVault, vault, Vault, VaultProvider, createTestVault, VaultStats, vaultRef

**Out of scope:**
- Vendor submodules (beorn-watcher-chaos, beorn-claude-tools) are separate projects
  - Their APIs use 'vault' terminology for generic concepts
  - Renaming would be breaking changes in those libraries

**Remaining 'vault' mentions:**
- Comments documenting the migration/deprecated APIs
- The deprecated export files (vault.ts, vault-context.tsx)
- check-migration.ts script itself

**Commit:** 62a9db4