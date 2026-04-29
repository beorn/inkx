---
id: "@km/flexily/private-field-string-access"
aliases:
  - km-flexily.private-field-string-access
  - km-flexily-private-field-string-access
created_by: claude:65d845d9
created_at: 2026-03-13T05:33:49Z
closed_at: 2026-03-13T05:36:55Z
close_reason: P3 quality — string indexing for private fields is a TypeScript
  pattern used intentionally to bypass type system for cross-module access. Not
  a bug.
---

# [x] markSubtreeLayoutSeen accesses private fields via string indexing @km/flexily #task #P3

layout-traversal.ts markSubtreeLayoutSeen() accesses Node's private fields using string indexing: '(current as Node)["_isDirty"] = false' and '(current as Node)["_hasNewLayout"] = true' (lines 22-23). This bypasses TypeScript's access control and is fragile -- renaming the private field would silently break at runtime without a compile error. Fix: add a public method to Node (e.g., markLayoutComplete()) that sets both flags, or make these fields package-internal via a friend interface. This is architectural debt from splitting the Node class and traversal into separate files while needing to modify private state. [pro]