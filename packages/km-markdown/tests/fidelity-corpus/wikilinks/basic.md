# Wikilink variants

Obsidian-style wikilinks come in many shapes. The parser must preserve the
exact text of each variant.

Simple link: [[Target Note]]

Link with display text: [[Target Note|My Alias]]

Link to a heading: [[Target Note#Section One]]

Link to a block: [[Target Note^block-abc123]]

Link to a heading with display text: [[Target Note#Section One|About section one]]

Link to a block with display text: [[Target Note^block-abc123|the relevant part]]

Multiple wikilinks on one line: see [[Alpha]], [[Beta]], and [[Gamma]] for context.

Wikilink in a list:

- See [[People/Bjørn Stabell]] for context
- Also [[Companies/Anthropic|Anthropic]] is relevant
- Deep reference: [[Projects/km#Architecture^arch-root|km architecture]]

Wikilink in a blockquote:

> Per [[Decisions/2026-01-policy]], we do X.
