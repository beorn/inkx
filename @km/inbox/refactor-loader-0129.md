---
id: "@km/inbox/refactor-loader-0129"
aliases:
  - km-refactor-loader-0129
  - "@km/_orphan/refactor-loader-0129"
created_at: 2026-01-29T18:20:44Z
closed_at: 2026-01-29T18:33:12Z
assignee: claude:298008b9
---

# [x] Refactor repo-loader.ts: extract discovery sources and link resolution @km/_orphan #task #P1 @claude:298008b9

repo-loader.ts (1377 lines) has several DRY violations:
- resolveLinks() and resolveLinksAsync() contain nearly identical logic
- discoverFilesOnly() and discoverFromFilesystem() share almost identical scanDirectory()
- Node insertion statements repeated in multiple places

Recommended approach:
1. Extract discovery-sources.ts - consolidate all discovery strategies
2. Extract link-resolution.ts - unified link resolver (sync/async)
3. Extract prepared statements into db-links.ts
Target: reduce to 400-500 lines