---
mentions:
  - km
---

# [x] Fix 6 schema/spec contradictions before Phase 1 (from pro review) @km/storage/tree #task #P1

GPT 5.4 Pro identified 6 contradictions + user wants item-as-object in this phase.

1. joinBackward degradation removes item from node WITH children → block-has-children violation. Fix: guard — only remove item if childless.
2. 'Column children must be items' validator wrong — body cards are blocks. Fix: scope validator.
3. Root parent_id: '.' vs null inconsistent. Fix: pick one, enforce.
4. name vs content confusion. Fix: getEditableText()/setEditableText().
5. Split inheritance: extractProps doesn't reset task_status. Fix: enforce in splitBlock.
6. Body-prefix rule not formalized. Fix: add schema rule.
7. item-as-object migration: item: true → item: { list?, task? }. Simplifies schema checks.

