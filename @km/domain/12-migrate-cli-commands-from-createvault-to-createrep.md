---
id: "@km/domain/12-migrate-cli-commands-from-createvault-to-createrep"
aliases:
  - km-domain.12
  - km-domain-12
  - "@km/domain/12"
created_at: 2026-01-26T08:28:48Z
closed_at: 2026-01-26T09:25:41Z
---

# [x] Migrate CLI commands from createVault to createRepo @km/domain #task #P2

22 production files use createVault. Migrate all CLI commands:
- program.ts, view.ts, show.ts, add.ts, bd.ts (8 calls), list.ts
- status.ts, move.ts, inbox.ts, rebuild.ts, init.ts, screenshot.ts
- bd-agent.ts (5 calls)

Depends on: file loading + Vault properties beads