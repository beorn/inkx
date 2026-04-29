---
id: "@km/props/6-km-props-add-property-conditions-to-query-parser"
aliases:
  - km-props.6
  - km-props-6
  - "@km/props/6"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T15:31:22Z
---

# [x] km-props: Add property conditions to query parser @km/props #task #P2

In packages/@km/_orphan/core/src/query/parser.ts:
1. Add QueryPropCondition interface to QueryAST
2. Parse prop::* (property exists)
3. Parse prop::value (property equals value)
4. Parse blocked:true/false (special condition)
