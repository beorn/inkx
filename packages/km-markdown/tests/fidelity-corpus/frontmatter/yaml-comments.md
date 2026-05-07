---
title: YAML with comments
priority: P3
owner: null
---

# YAML with comments

YAML supports `#` line comments in frontmatter. Many plugins and humans
leave comments as documentation. A lossless round-trip should preserve them;
if it can't, this fixture goes in `known-drift.ts` with a note.

