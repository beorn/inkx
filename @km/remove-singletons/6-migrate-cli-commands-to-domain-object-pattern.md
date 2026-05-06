---
mentions:
  - km
id: "@km/remove-singletons/6-migrate-cli-commands-to-domain-object-pattern"
aliases:
  - km-remove-singletons.6
  - km-remove-singletons-6
  - "@km/remove-singletons/6"
created_at: 2026-01-23T23:13:22Z
closed_at: 2026-01-23T23:20:10Z
---

# [x] Migrate CLI commands to domain object pattern @km/remove-singletons #task #P1

Migrate sync.ts, daemon.ts, rebuild.ts, bd.ts from singleton APIs (setKmDir, getDb, loadVault) to createVault/runWithDb pattern.

