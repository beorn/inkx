---
id: "@km/inbox/kk0x1"
aliases:
  - km-kk0x1
  - "@km/_orphan/kk0x1"
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:23Z
closed_at: 2026-03-23T22:21:20Z
close_reason: "Done: created @silvery/ag package, extracted
  types/keys/focus-manager/focus-events/tree-utils from tea. Tea re-exports for
  backwards compat. ag-term now imports from ag instead of tea."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Move core types/keys/focus/streams from tea → term @km/_orphan #task #P0 @claude:fed8de9e

50+ imports in @silvery/term from @silvery/tea. Only ~3 are actual TEA (store). Move: types (AgNode, BoxProps, TextProps, Rect), keys (parseKey, keyToAnsi), focus system, streams, tree-utils into @silvery/term or internal @silvery/core. This removes the term→tea dependency.