---
id: "@km/tui/sticky-type"
aliases:
  - km-tui.sticky-type
  - km-tui-sticky-type
created_by: Bjørn Stabell
created_at: 2026-03-31T19:13:51Z
closed_at: 2026-04-01T02:51:55Z
close_reason: KNode.extractProps() denylist model (SlateJS-compatible).
  SYSTEM_KEYS excludes 13 structural fields, everything else inherits.
  deriveFsType() in app layer. 4 handler duplication sites replaced. 9 new
  tests. Commit 1452b100.
---

# [x] Sticky type: new nodes inherit characteristics from source node @km/tui #feature #P2 @Bjørn Stabell

When creating a new item/block/node via Enter (linebreak_after, linebreak_child, linebreak_split), the new node should inherit characteristics from the source node (cursor node or prev sibling): task marker (- [ ] vs -), list type (ol/ul), node type (p/li/h). This matches how every text editor works — pressing Enter in a task list creates another task, pressing Enter in a numbered list creates the next number.