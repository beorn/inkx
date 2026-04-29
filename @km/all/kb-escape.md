---
id: "@km/all/kb-escape"
aliases:
  - km-all.kb-escape
  - km-all-kb-escape
created_by: claude:536645b5
created_at: 2026-02-20T15:47:59Z
closed_at: 2026-02-20T18:18:38Z
owner: bjorn@stabell.org
---

# [x] Keybinding v2: escape layering (text→node→unfocus→close→clear→noop) @km/all #task #P2

Rework escape to pop a focus stack: text edit → node mode → unfocus pane (stays open) → close dialog(s) → clear selection → no-op. Currently escape closes the pane instead of unfocusing. See docs/keybindings-v2.md §Escape Layering.