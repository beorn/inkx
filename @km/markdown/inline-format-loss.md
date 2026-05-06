---
mentions:
  - km
  - Bjørn
id: "@km/markdown/inline-format-loss"
aliases:
  - km-markdown.inline-format-loss
  - km-markdown-inline-format-loss
created_by: Bjørn Stabell
created_at: 2026-04-06T20:48:59Z
closed_at: 2026-04-07T01:16:17Z
close_reason: "Fixed in d402c2f26: parser captures verbatim inline source slice
  into node.data._mdSource at parse time, serializer emits source byte-for-byte
  when content matches the parse-time baseline. Unedited nodes preserve
  formatting through file-watch cycles. New test suite at
  packages/km-markdown/tests/inline-format-preserve.test.ts."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] P0: Edit silently strips ALL inline formatting (bold/italic/code/links/strike) from entire file @km/markdown #bug #P0 @Bjørn Stabell

EVERY edit causes the whole file to be rewritten without inline markup:

- **bold** → bold
- *italic* → italic
- `inline code` → inline code
- [label](url) → label (URL LOST)
- ~~strike~~ → strike
- alt bullets (* +) → -
- numbered list indentation normalized
- final newline stripped

Root cause: nodeToText() in @km/markdown/src/parser.ts:455 recurses children concatenating only .value strings, discarding wrapping nodes (strong, emphasis, inlineCode, link, delete). Stored as plain text in node.content. Serializer has no info to reconstruct.

Documented in tests as known: roundtrip.test.ts:36-39, 950-956.

Fix: store the full mdast (or a lossless AST) in node.body, not just plain text. Serialize from AST.

