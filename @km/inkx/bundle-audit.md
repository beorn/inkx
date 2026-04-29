---
id: "@km/inkx/bundle-audit"
aliases:
  - km-inkx.bundle-audit
  - km-inkx-bundle-audit
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:24Z
closed_at: 2026-02-23T11:42:09Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Measure and optimize inkx bundle size @km/inkx #task #P2 @claude:ee8efc0f

Measure and optimize inkx bundle size for npm consumers.

## Current measurements (Feb 2026)
- dist/: 2.2MB
- src/: 1.5MB across 149 files
- 161 exports from main entry point

## Tasks
- [ ] Add reproducible bundle size measurement (scripts/measure-bundle.ts)
- [ ] Measure tree-shaking effectiveness: what ships if you only import Box + Text + render?
- [ ] Identify heavy dependencies that could be optional (e.g., image protocols, animation)
- [ ] Measure gzipped bundle size for core-only vs full import
- [ ] Add size-limit CI check
- [ ] Compare with ink bundle size (fair comparison)

## Context
ink ships a much smaller package because it has only 4 components. inkx has 24 components + 30+ hooks. The question is: does the layered architecture (@km/silvery-legacy/layered-arch) allow tree-shaking to bring core-only imports close to ink size?

## Depends on
- @km/silvery-legacy/layered-arch (determines what can be tree-shaken)