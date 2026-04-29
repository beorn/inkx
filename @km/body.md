---
id: "@km/body"
aliases:
  - km-body
  - "@km/_orphan/body"
created_at: 2026-01-23T15:18:22Z
closed_at: 2026-01-23T15:53:39Z
---

# [x] Body content as virtual nodes in board view @km/body #epic #P2

Group leading non-section content (paragraphs, code, quotes) into virtual 'body' nodes.

Display as:
- Board body → virtual first column
- Column body → virtual first card  
- Card body → virtual first child
- Recursive at all depths

Design: Computed/virtual at display time (not physical storage).
Navigation: Read-only, cursor skips body elements.

See plan: ~/.claude/plans/snoopy-imagining-candy.md