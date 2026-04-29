---
id: "@km/props/3-km-props-add-serialization-to-nodes2md-for-round-t"
aliases:
  - km-props.3
  - km-props-3
  - "@km/props/3"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T12:13:27Z
---

# [x] km-props: Add serialization to nodes2md for round-trip @km/props #task #P1

In nodes2md.ts, modify serializeTask() to:
1. Reconstruct properties from data.propsRaw
2. Only add properties that aren't already in content (avoid duplication)
3. Preserve property order

File: packages/@km/markdown/src/nodes2md.ts (around line 234)
