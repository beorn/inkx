---
mentions:
  - km
id: "@km/markdown/footnotes"
aliases:
  - km-markdown.footnotes
  - km-markdown-footnotes
created_by: claude:4c413aae
created_at: 2026-02-21T23:21:44Z
owner: bjorn@stabell.org
---

# [ ] Footnote support via item.marker @km/markdown #feature #P4

Footnote definitions in markdown ([^1]: content) could be represented naturally in kmast v2 as items with marker: "[^1]". The item.marker field already supports arbitrary strings, so footnote defs would just be items whose marker is a footnote reference. No new node types needed.

Example:

```markdown
[^1]: This is the footnote content.
    Can span multiple indented lines.
[^note]: Named footnotes work too.
```

Would become items with marker="[^1]" and marker="[^note]" respectively, with the footnote body as content/children.

Low priority — footnotes are rare in the current use case. Identified during kmast v2 design discussion (O3 deep research flagged it as a clever use of the trait model).

