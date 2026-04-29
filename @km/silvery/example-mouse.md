---
id: "@km/silvery/example-mouse"
aliases:
  - km-silvery.example-mouse
  - km-silvery-example-mouse
created_by: claude:55df8ef1
created_at: 2026-03-10T00:03:50Z
closed_at: 2026-03-10T01:21:16Z
close_reason: "Done. Mouse events wired in showcase-app.tsx (SGR mouse mode +
  onBinary parsing) and viewer-app.tsx (click-to-cell conversion).
  KanbanShowcase, ScrollShowcase, FocusShowcase already had useMouseClick
  handlers. CLIWizardShowcase got a new click handler for select steps. Verified
  mouse clicking works via onBinary.fire() test in browser. Commits: c581a27
  (mouse wiring), 13787df (backspace fix found during testing)."
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Wire mouse events to silvery.dev web examples @km/silvery #task #P2 @claude:55df8ef1

Add mouse click support to silvery.dev web examples. CLI wizard (click to select options), Kanban (click to select cards), Scroll list (click to select items), Focus panels (click to focus), Text input (click to focus). The xterm.js terminal already reports mouse events -- showcase components just need useMouseClick handlers. Related: @km/silvery/example-improvements (parent tracking bead).