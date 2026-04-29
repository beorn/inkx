---
id: "@km/vault-loader/0-create-vault-loader-ts-with-loadvault"
aliases:
  - km-vault-loader.0
  - km-vault-loader-0
  - "@km/vault-loader/0"
created_at: 2026-01-23T09:39:59Z
closed_at: 2026-01-23T09:53:23Z
---

# [x] Create vault-loader.ts with loadVault() @km/vault-loader #task #P2

Create the unified vault loader in packages/@km/storage/src/vault-loader.ts:

- loadVault(rootPath?, options?) generator function
- discoverFromFilesystem() for memory mode - scan .md files, generate events
- discoverFromEvents() for disk mode - read events.jsonl
- Shared applyEvents() phase with transaction wrapping
- Shared resolveLinks() phase for wikilinks
- Shared evaluateRules() using existing evaluateAllRules()

Returns LoadResult { mode, nodeCount, linkCount, errors, duration }