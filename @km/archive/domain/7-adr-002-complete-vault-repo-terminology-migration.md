---
mentions:
  - km
  - db124dfa
id: "@km/domain/7-adr-002-complete-vault-repo-terminology-migration"
aliases:
  - km-domain.7
  - km-domain-7
  - "@km/domain/7"
created_at: 2026-01-26T07:57:29Z
closed_at: 2026-01-26T15:48:08Z
assignee: db124dfa
---

# [x] ADR-002: Complete Vault→Repo terminology migration @km/domain #task #P2 @db124dfa

## Goal

Remove ALL 'vault' terminology from codebase. Standardize on 'repo' everywhere.

## How to Execute

**Use the batch-refactor skill.** This is a well-documented migration (ADR-002), so the skill should:

1. Read CLAUDE.md - see ADR-002 vault→repo migration documented
2. Search for vault mentions with ast-grep
3. Apply all changes (zero questions needed - context is clear)
4. Verify with `bun fix && bun run test:all`

**Trigger phrase:**

```
"complete the vault→repo terminology migration"
```

## Acceptance Test

```bash
bun scripts/check-migration.ts   # Must show 0 unexpected mentions
bun fix                          # Must pass
bun run test:all                 # Must pass
```

## Key Renames

| Old               | New              |
| ----------------- | ---------------- |
| vaultPath         | repoPath         |
| vaultRoot         | repoRoot         |
| Vault (type)      | Repo             |
| vault (param)     | repo             |
| setDebugVaultRoot | setDebugRepoRoot |

## Allowed Exceptions (don't change)

- Obsidian vault references (external system)
- ADR history/docs (historical context)
- URLs containing "vault"
- vault-context.tsx compat aliases (remove after migration)

## Already Done

- ✅ vendor/beorn-inkx-ui (loadVault → loadRepo)
- ✅ vendor/beorn-watcher-chaos (vaultPath → repoPath)
- ✅ @km/_orphan/board comments (Vault → Repo)
- ✅ @km/_orphan/core/service.ts examples
- ✅ debug-log.ts (setDebugRepoRoot + backward-compat alias)
- ✅ scripts/check-migration.ts created
- ✅ @km/beads/short-ids.ts (options.vault → options.repo)

## Context

- ADR: [docs/adr/002-domain-objects-refactor.md](docs/adr/002-domain-objects-refactor.md)
- Plan: [.claude/plans/inherited-toasting-wigderson.md](.claude/plans/inherited-toasting-wigderson.md)
- CLAUDE.md documents the migration in section 15 (Domain Object Pattern)

