---
mentions:
  - km
  - claude
id: "@km/tui/prop-value-color"
aliases:
  - km-tui.prop-value-color
  - km-tui-prop-value-color
created_by: claude:8f007ba9
created_at: 2026-02-19T16:00:07Z
closed_at: 2026-02-19T17:01:52Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Detail pane: prop values sometimes grey:grey instead of grey:color @km/tui #bug #P2 @claude:8f007ba9

## Bug

Detail pane metadata props (Status, Due, Created, Completed, Projects, Mentions) have inconsistent value styling:

- Sometimes: grey key + white/colored value (correct)
- Sometimes: grey key + grey value (wrong — values blend into keys)

See screenshots: ~/Desktop/Screenshot 2026-02-19 at 15.55.38.png (correct — values are white/colored) vs ~/Desktop/Screenshot 2026-02-19 at 15.55.32.png (wrong — all grey).

## Expected

Always: grey key label, colored/white value. Every prop value should be visually distinct from its key.

## Where to look

Detail pane rendering in apps/@km/tui/src/views/ — likely the metadata table rendering path. Check if some values get dimmed based on done/completed status (the grey:grey screenshot is a completed task with status=done).

