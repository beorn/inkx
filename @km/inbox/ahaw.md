---
mentions:
  - km
id: "@km/inbox/ahaw"
aliases:
  - km-ahaw
  - "@km/_orphan/ahaw"
created_at: 2026-01-26T10:21:45Z
closed_at: 2026-01-26T10:22:38Z
---

# [x] Phase 6: Complete vault→repo terminology migration @km/_orphan #task #P1

## Context

Part of ADR-002 Domain Objects Refactor. This is the final phase - completing the Vault → Repo terminology migration across ALL code.

## Status

Partially complete. Codebase builds with backward-compat aliases.

## Already Done

- @km/_orphan/board comments updated (Vault → Repo)
- @km/_orphan/core/service.ts examples updated
- scripts/check-migration.ts created (run to see remaining work)
- vendor/beorn-inkx-ui updated (loadVault → loadRepo)
- vendor/beorn-watcher-chaos updated (vaultPath → repoPath)
- debug-log.ts: setDebugRepoRoot added (setDebugVaultRoot kept as compat alias)

## Remaining Work (~850 mentions per check-migration.ts)

1. Update ResolvedPathArg.vaultRoot → repoRoot in @km/storage
2. Update all CLI commands using vaultRoot/vaultPath variables
3. Update @km/beads - vault param → repo
4. Update @km/storage/testing - chaos-hooks.ts
5. Update user-facing strings - 'vault' → 'repo' in messages
6. Remove backward-compat aliases after all callers updated

## Key Renames

| Old           | New      |
| ------------- | -------- |
| vaultPath     | repoPath |
| vaultRoot     | repoRoot |
| Vault (type)  | Repo     |
| vault (param) | repo     |

## To Resume

```bash
bun scripts/check-migration.ts   # See remaining work
cat ~/.claude/plans/eventual-whistling-sky.md  # See full plan
```

## Verification

```bash
bun scripts/check-migration.ts  # Should report 0 unexpected mentions
bun fix
bun run test:all
```

## Related Beads

- @km/domain/0-phase-0-steering-docs-claude-md-refactor-skill through @km/domain/14-remove-createvault-and-legacy-vault-exports (earlier phases, all CLOSED)
- ADR-002: docs/adr/002-domain-objects-refactor.md

