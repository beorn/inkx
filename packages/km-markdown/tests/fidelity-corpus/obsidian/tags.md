# Obsidian tags

Tags use `#word` syntax. They can contain forward slashes for hierarchy.
The parser must distinguish tags from markdown headings — a `#` at the
start of a line followed by space is a heading; a `#` followed by a word
character is a tag.

## Top-level tags

This paragraph mentions #work and #home tags.

## Hierarchical tags

Project tags: #project/km #project/decker #project/bearly

Area tags: #area/finance #area/health #area/relationships

## Tags with special characters

Numbers: #v2 #q4-2025

Hyphens: #good-first-issue #high-priority

Underscores: #code_review

## Tags not at word boundaries

This is not a tag: test#word (not preceded by whitespace/start).

Neither is #1234 alone — numeric-only is conventionally not a tag.

But #1234abc is a tag.

## Tags inside code should not be tags

Inline: `const x = "#not-a-tag"` — the `#` is inside code.

```ts
// Also not tags:
const hashtag = "#inside-a-code-block"
```

## Tags inside wikilinks are not tags

[[Note about #topic]] — the `#` here is a wikilink anchor, not a tag.

## Frontmatter tags reference

The frontmatter at the top of a vault note might look like:

```yaml
tags: [from-frontmatter, also-from-frontmatter]
```

These are handled separately from body tags.
