---
id: "@km/props/7-km-props-implement-property-query-execution"
aliases:
  - km-props.7
  - km-props-7
  - "@km/props/7"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T15:31:23Z
---

# [x] km-props: Implement property query execution @km/props #task #P2

In packages/@km/storage/src/query.ts, modify executeQuery() to:
1. Handle property conditions with json_extract(data, '$.props.key')
2. Implement blocked:true = has blocked-by property with unresolved targets
3. Implement blocked:false = no blockers or all blockers done

Create packages/@km/storage/tests/query-properties.test.ts with tests.
