---
id: "@km/remove-singletons/0-migrate-km-cli-commands-from-setkmdir-getkmdir"
aliases:
  - km-remove-singletons.0
  - km-remove-singletons-0
  - "@km/remove-singletons/0"
created_at: 2026-01-23T20:59:05Z
closed_at: 2026-01-23T22:59:44Z
---

# [x] Migrate km-cli commands from setKmDir/getKmDir @km/remove-singletons #task #P1

Files: sync.ts, daemon.ts, rebuild.ts, bd.ts
Pattern: Replace setKmDir(x) with passing kmDir through context or using vault.path