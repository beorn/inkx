---
mentions:
  - km
  - claude
id: "@km/flexx/bundle-audit"
aliases:
  - km-flexx.bundle-audit
  - km-flexx-bundle-audit
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:20Z
closed_at: 2026-02-23T11:42:08Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Measure and optimize flexx bundle size @km/flexx #task #P2 @claude:ee8efc0f

Measure, audit, and optimize flexx bundle size for npm consumers.

## Current measurements (Feb 2026)

- Raw: 181KB (core zero-alloc export via bun build --minify)
- Gzip: 35KB
- README claims "38KB raw, ~8KB gzip" — STALE, needs updating

## Tasks

- [ ] Add a reproducible bundle size measurement script (e.g., scripts/measure-bundle.ts)
- [ ] Verify what README/docs claim vs actual numbers
- [ ] Update all bundle size claims in README.md, docs/performance.md
- [ ] Investigate tree-shaking: can consumers import only constants without pulling layout engine?
- [ ] Check if debug dependency is excluded in production builds (it should be dev-only or conditional)
- [ ] Consider: are there dead code paths in layout-zero.ts that could be trimmed?
- [ ] Add bundle size CI check (e.g., size-limit) to prevent regressions

## Context

Yoga is 38KB gzip. Flexx README claims ~8KB gzip but actual measurement shows 35KB — nearly identical to Yoga. This undermines the "5x smaller" marketing claim. Need to either optimize or correct the messaging.

