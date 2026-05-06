---
mentions:
  - km
id: "@km/tui/body-extraction-position"
aliases:
  - km-tui.body-extraction-position
  - km-tui-body-extraction-position
created_by: claude:f8196c1c
created_at: 2026-03-28T06:24:59Z
owner: bjorn@stabell.org
---

# [ ] Analyze extractBody position-based split — is it the right design? @km/tui #task #P2

extractBody() splits children into body/structural based on position of the first isOutline node. Everything before = body, everything after = structural. This is fragile: list items before headings are 'body' even if meaningful. Need to review the original design decision (there was significant back-and-forth) and determine if explicit marking would be better. Questions: (1) Why was position-based chosen over explicit marking? (2) What breaks if we change it? (3) Should body be a node trait instead of derived?

