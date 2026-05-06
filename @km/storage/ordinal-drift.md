---
mentions:
  - km
  - Bjørn
id: "@km/storage/ordinal-drift"
aliases:
  - km-storage.ordinal-drift
  - km-storage-ordinal-drift
created_by: Bjørn Stabell
created_at: 2026-04-01T06:11:31Z
closed_at: 2026-04-02T21:33:26Z
close_reason: "Fixed: Three-phase node matching — block_id first, content hash
  second, ordinal fallback last. Inserting paragraphs no longer shifts sibling
  identity. 8 new tests. Commit ee5c605d."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] node-differ structural matching by ordinal causes identity drift on insertion @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/handlers/node-differ.ts:63-165
Classification: P1

Structural matching by (parent_id, ordinal, type) causes identity drift on insertions/reorders. Inserting a paragraph at the top shifts every later sibling's ordinal, making each look like an update of the previous node. This can move metadata anchored to IDs (block_id, task state, backlinks, embeds) to wrong logical nodes.

Suggested fix: Match by stronger anchors first: block_id, explicit parser/source IDs, mdast source span, stable content hash, or LCS-style sibling matching. Use ordinal fallback only when no stronger identity exists.

