---
id: "@km/inkx/react-devtools"
aliases:
  - km-inkx.react-devtools
  - km-inkx-react-devtools
created_by: claude:ee8efc0f
created_at: 2026-02-23T01:22:41Z
closed_at: 2026-02-23T01:47:51Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] React DevTools integration @km/inkx #feature #P3 @claude:ee8efc0f

Expose React custom renderer hooks to allow the React DevTools browser extension to inspect the inkx component tree. Separate from inkx-native inspector — this connects to the standard React DevTools protocol via react-devtools-core, enabling familiar React debugging workflows for inkx apps.