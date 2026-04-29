---
id: "@km/flexx/contributing"
aliases:
  - km-flexx.contributing
  - km-flexx-contributing
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:21Z
closed_at: 2026-02-23T11:42:08Z
---

# [x] Add CONTRIBUTING.md and engines field to flexx @km/flexx #task #P2 @claude:ee8efc0f

Add contributor-facing docs and package.json polish for flexx.

## Tasks
- [ ] Create CONTRIBUTING.md: dev setup, test commands, benchmark protocol, PR guidelines
- [ ] Add engines field to package.json (minimum Node/Bun version)
- [ ] Add keywords to package.json for npm discoverability
- [ ] Verify repository/homepage/bugs URLs in package.json
- [ ] Add TypeScript strict mode verification to CI (if not already)

## Why
Professional OSS packages need contributor docs. Engines field prevents confusing install failures on old runtimes. Keywords improve npm search ranking.