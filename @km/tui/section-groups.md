---
id: "@km/tui/section-groups"
aliases:
  - km-tui.section-groups
  - km-tui-section-groups
created_by: claude:fcaad2fa
created_at: 2026-02-18T15:04:11Z
closed_at: 2026-02-19T10:54:58Z
---

# [x] Show section grouping headers above task cards (like Asana) @km/tui #feature #P3 @claude:36393b5d

Section grouping in Asana import columns: Parent tasks create section headings in the markdown, with embedded link cards (^ID) below them pointing to the actual task. The display issue is:
1. The ^ID cards need link_to resolution (tracked by @km/tui/link-title — agent fixing)
2. The section header cards ('Finance & Taxes', 'Waiting', etc.) are rendered as regular bordered cards instead of as dividers/headers. They should render distinctly (e.g., no border, or as column sub-headers).
3. Once link_to resolves, the embedded link card BELOW the section header will show the parent task title — which may be redundant with the section header itself. Need to consider: should the embedded link card be hidden when it duplicates its section header?