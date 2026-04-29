---
id: "@km/rev-arch-0130/12-fix-knip-config-for-workspace-packages"
aliases:
  - km-rev-arch-0130.12
  - km-rev-arch-0130-12
  - "@km/rev-arch-0130/12"
created_at: 2026-01-30T00:35:51Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Fix knip config for workspace packages @km/rev-arch-0130 #task #P2 @claude:da8e4a66

Medium: knip reports 21 unused devDeps but these are all @km/* workspace packages - likely knip config issue. Fix to avoid false positives.