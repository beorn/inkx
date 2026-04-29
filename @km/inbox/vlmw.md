---
id: "@km/_orphan/vlmw"
aliases:
  - km-vlmw
created_at: 2026-01-21T13:32:51Z
closed_at: 2026-01-21T13:36:58Z
---

# [x] Support task checkboxes in headings for issue files @km/_orphan #feature #P2

Allow headings to have task checkboxes like:

# [x] Done task @issue #feature #P2
# [ ] Open task @issue #bug #P1

This would simplify issue file format by:
- Removing status from frontmatter (expressed via checkbox)
- Removing type from frontmatter (expressed via #tag)
- Removing priority from frontmatter (expressed via #P1-4)

Requires parser changes to extract task marks from headings.