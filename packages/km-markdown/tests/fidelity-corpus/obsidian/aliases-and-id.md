---
id: 01HVQZ3MZYX0RNK8QKM7B1F4JA
aliases:
  - Short Alias
  - A longer alias with spaces
  - Alias-with-hyphens
title: Canonical Title
tags:
  - reference
  - fixture
---

# Canonical Title

Obsidian convention: `id` and `aliases` in frontmatter.

- The `id` field gives the note a stable identifier that survives renames.
- The `aliases` array lets other notes link via any alias:
  `[[Short Alias]]`, `[[A longer alias with spaces]]`, or
  `[[Alias-with-hyphens]]` all resolve to this note.

The parser should preserve both fields exactly.

## References from this note

Inbound links expected:

- [[Another Note]] → may link as `[[Short Alias]]`
- [[Yet Another]] → may link as `[[A longer alias with spaces|shortened]]`

## Wikilinks out

This note links to [[Canonical Other|other]] and [[Canonical Third]].
