---
title: Multi-line string values
summary: |
  A folded YAML block literal. Newlines are preserved,
  trailing whitespace is stripped per line.

  Paragraph break.
notes: >
  Folded scalar — newlines become spaces except
  at paragraph boundaries.

  Second paragraph stays separate.
quoted: "A single-line value with \"embedded quotes\" and \\ backslashes."
---

# Multi-line string values

YAML multi-line strings (|, >, quoted) are common in Obsidian for notes
or summary fields. The parser must preserve both the content and the
style indicator (| vs > vs "...").
