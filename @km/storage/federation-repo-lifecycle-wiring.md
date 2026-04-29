---
id: "@km/storage/federation-repo-lifecycle-wiring"
aliases:
  - km-storage.federation-repo-lifecycle-wiring
  - km-storage-federation-repo-lifecycle-wiring
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:35:56Z
closed_at: 2026-04-22T17:31:46Z
close_reason: "Shipped commit ec122c1a8. Repo interface gains readonly repoId:
  RepoId. initWithFileLoading calls readOrMintRepoId(kmDir); memory mode mints
  transient RepoId via mintRepoId() (not persisted, per-Repo lifetime,
  documented). createRepo + createBareRepo + FakeRepo all expose it. 6 tests
  pass in repo-id-lifecycle.test.ts: fresh mint, reopen idempotent, existing-id
  preserved, malformed config falls back, memory-mode transient, multi-repo
  isolation."
---

# [x] Wire Repo lifecycle to use readOrMintRepoId on open @km/storage #task #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The federation bead (closed 2026-04-22) shipped the RepoId type + readOrMintRepoId + loadWorkspace + parseKmUri. The actual Repo lifecycle (createRepo in packages/@km/storage/src/repo/repo.ts) doesn't yet call readOrMintRepoId on open — so existing vaults never get a persisted RepoId.

## Scope
- createRepo / loadRepo calls readOrMintRepoId(kmDir) on open, stores the RepoId on the Repo object
- session-db + future sync layers consume repo.repoId when keying per-repo state
- Migration: existing .km/ without config.toml mints fresh on first open of upgraded km

## /complete
- Every Repo has a .repoId property accessible to consumers
- Existing vaults auto-mint on first post-upgrade open
- Test: open existing vault, verify config.toml gains repo_id; reopen, verify same repo_id