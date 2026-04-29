---
id: "@km/rev-0129/8-complete-or-document-board-sync-rules"
aliases:
  - km-rev-0129.8
  - km-rev-0129-8
  - "@km/rev-0129/8"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Complete or document Board sync= rules @km/rev-0129 #task #P3 @claude:298008b9

packages/@km/storage/src/db-rules.ts:119-122 has sync rule evaluation commented out:
// Future: evaluate sync= rule
// if (rules.sync) {
//   evaluateSyncRule(db, node.id, rules.sync, ctx);
// }

Either implement or document that sync= parsing is supported but evaluation deferred.