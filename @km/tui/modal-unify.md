---
id: "@km/tui/modal-unify"
aliases:
  - km-tui.modal-unify
  - km-tui-modal-unify
created_by: claude:949598cc
created_at: 2026-02-11T20:12:16Z
closed_at: 2026-02-12T14:14:45Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Unify modal bypass into command system @km/tui #task #P3 @claude:586bad48

Help overlay, delete confirm, and console currently short-circuit handleKey() with if-checks before the command system. Instead, use context flags (helpOpen=true) + when predicates so ALL keys flow through resolveKeybinding(). Eliminates special cases, makes modals extensible (scrollable help, etc.) without more if-checks. Ref: O3 deep research review of event handling architecture.