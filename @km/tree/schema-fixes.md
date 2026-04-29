---
id: "@km/tree/schema-fixes"
aliases:
  - km-tree.schema-fixes
  - km-tree-schema-fixes
created_by: Bjørn Stabell
created_at: 2026-04-01T19:59:28Z
closed_at: 2026-04-01T20:23:32Z
close_reason: "Commit 6c251625: schema layer
  (canHaveChildren/canParent/canBecomeBlock), joinBackward child guard,
  body-prefix validation, getEditableText/setEditableText. 407 tests pass."
owner: bjorn@stabell.org
---

# [x] Fix 6 schema/spec contradictions before Phase 1 (from pro review) @km/tree #task #P1

GPT 5.4 Pro identified 6 contradictions + user wants item-as-object in this phase.

1. joinBackward degradation removes item from node WITH children → block-has-children violation. Fix: guard — only remove item if childless.
2. 'Column children must be items' validator wrong — body cards are blocks. Fix: scope validator.
3. Root parent_id: '.' vs null inconsistent. Fix: pick one, enforce.
4. name vs content confusion. Fix: getEditableText()/setEditableText().
5. Split inheritance: extractProps doesn't reset task_status. Fix: enforce in splitBlock.
6. Body-prefix rule not formalized. Fix: add schema rule.
7. item-as-object migration: item: true → item: { list?, task? }. Simplifies schema checks.