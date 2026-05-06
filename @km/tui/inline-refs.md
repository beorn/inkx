---
mentions:
  - km
  - claude
id: "@km/tui/inline-refs"
aliases:
  - km-tui.inline-refs
  - km-tui-inline-refs
created_by: claude:fcaad2fa
created_at: 2026-02-18T15:41:44Z
closed_at: 2026-02-19T16:17:15Z
owner: bjorn@stabell.org
assignee: claude:fcaad2fa
---

# [x] Inline ^caret references show raw Asana GIDs in body text @km/tui #bug #P2 @claude:fcaad2fa

Body text contains inline caret references like 'See previous ^1202466275397380' and 'talk to Fidelity^1212075048027297'. These should either be resolved to the target node title (as a clickable/readable reference) or stripped for display. stripForDisplay() only strips ^id at END of text, not inline ones. Separate from link_to node resolution (@km/tui/link-title).

