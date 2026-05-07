---
mentions:
  - km
id: "@km/storage/ast-alignment"
aliases:
  - "@km/all/ast-alignment"
  - km-all.ast-alignment
  - km-all-ast-alignment
created_by: Bjørn Stabell
created_at: 2026-04-01T19:30:27Z
owner: bjorn@stabell.org
---

# [ ] Should km-ast types match KNode? Should content be an AST? @km/all #task #P3

Two related questions:

1. @km/ast ↔ KNode alignment: Parser produces oi/li types. Storage uses type:h/p + item:true. These are different representations of the same thing. Should they be unified? What breaks if we make KNode use oi/li directly?
2. Block content as AST: KNode.content is a markdown string. Slate uses a children array of inline nodes (text + marks). Should km adopt structured content?
- Pro: inline formatting without reparsing, cursor position in rich text, collab editing
- Con: complexity, markdown round-trip, every consumer changes
- Middle ground: keep markdown as source, parse to inline AST on demand (lazy)

Check: how does Decker handle this? (Slate children array). What would the migration look like?

