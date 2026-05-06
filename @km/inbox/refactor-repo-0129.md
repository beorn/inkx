---
mentions:
  - km
  - claude
id: "@km/inbox/refactor-repo-0129"
aliases:
  - km-refactor-repo-0129
  - "@km/_orphan/refactor-repo-0129"
created_at: 2026-01-29T18:20:44Z
closed_at: 2026-01-29T18:33:12Z
assignee: claude:298008b9
---

# [x] Refactor repo.ts: extract shared methods from createRepo/createBareRepo @km/_orphan #task #P1 @claude:298008b9

repo.ts (1265 lines) has massive duplication between createRepo() and createBareRepo():

- 60+ repeated method implementations (query, mutation, sync methods)
- Method dispatch patterns identical in both factories
- Mutation context handling nearly identical
- Lifecycle management duplicated

Recommended approach:

1. Extract RepoQueryMethods - static factory for query methods
2. Extract RepoMutationMethods - static factory for mutation methods
3. Extract RepoSyncMethods - static factory for sync methods
4. Extract RepoLifecycle - mixin for close/dispose
5. Both factories delegate to these instead of reimplementing
Target: reduce each factory to ~150 lines

