---
id: "@km/_orphan/focsb"
aliases:
  - km-focsb
created_by: claude:fcaad2fa
created_at: 2026-02-18T10:44:17Z
closed_at: 2026-02-18T10:49:49Z
owner: bjorn@stabell.org
---

# [x] Import: task content formatting broken — no styling, no blank lines, jumbled text @km/_orphan #bug #P2

Import task body content is stored as a single string in a blockquote node. Should be structured KNodes instead.

Current: import creates one `quote` node with a big content string (body + comments concatenated). TUI renders this as a single run-on line.

Desired: parse body content into child KNodes — paragraphs (p), lists (li/oi), headings (h), code blocks (code), etc. The markdown parser already handles this for regular .md files. The import pipeline should use the same parsing to structure the body.

Approach:
1. In convert.ts, instead of creating a single quote node with buildBlockquoteContent(), parse the body markdown into KNodes using the markdown parser
2. Attach these as children of the task node (or a body container)
3. Comments could be separate child nodes too (each comment = a quote with children)
4. This makes TUI rendering work automatically — each node type already has its renderer

This is the correct architectural fix — not a TUI rendering workaround.