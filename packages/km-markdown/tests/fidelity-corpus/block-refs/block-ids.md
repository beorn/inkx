# Block IDs and references

Obsidian block IDs are suffixes like `^blockid` attached to the end of a
block. They enable `[[Note#^blockid]]` references.

This paragraph has a block id at the end. ^intro-para

Another paragraph, no id.

## Heading with ID ^heading-ref

List items can have block ids too:

- First item
- Second item with an id ^second-item
- Third item

> Blockquote lines can be ID'd at the end. ^quote-ref

Paragraph references back: see [[self#^intro-para]] and [[other#^heading-ref]].

## Embeds (transclusions)

Embed a whole note: ![[Other Note]]

Embed a heading: ![[Other Note#Section]]

Embed a block by id: ![[Other Note^some-block]]

Embed with display alias: ![[Other Note|Display]]

Embeds in a list:

- ![[Daily/2026-01-14]]
- ![[Projects/km^current-status]]
