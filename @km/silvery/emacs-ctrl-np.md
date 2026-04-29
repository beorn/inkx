---
id: "@km/silvery/emacs-ctrl-np"
aliases:
  - km-silvery.emacs-ctrl-np
  - km-silvery-emacs-ctrl-np
created_by: claude:1eb07bba
created_at: 2026-04-26T05:44:46Z
closed_at: 2026-04-26T06:38:38Z
close_reason: "Shipped: 9f051ca2 (silvery). Ctrl-P/Ctrl-N aliases for Up/Down. 5
  tests. Session: km-session.0425-evening"
---

# [x] Emacs Ctrl-N/P bindings in TextArea (next/prev line) and queue-command edge handoff @km/silvery #feature #P3 @claude:2405c72e

blocks:: [[@km/silvery]]

Silverys readline already covers Ctrl-A/E/B/F/K/U/W/Y/T and Alt-B/F/D, but Ctrl-N/Ctrl-P are missing. Per useReadline.ts comment they were intentionally not in readline-ops because they need stateful history; the user just wants them as Up/Down line-nav aliases inside a multi-line TextArea (and to trigger onEdge handoff between silvercodes queue and command regions, same as arrow keys do today). Plan: add Ctrl-P=Up, Ctrl-N=Down aliases in vendor/silvery/packages/ag-react/src/ui/components/useTextArea.ts where Up/Down are handled. Test in silvery first; silvercode inherits. Note: Ctrl-B is used by silvercode App.tsx:377 for background-turn (App-level capture), no conflict with TextArea-internal Ctrl-B (back-char) since textarea handler runs only when isActive.