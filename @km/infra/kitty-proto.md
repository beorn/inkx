---
mentions:
  - km
  - claude
id: "@km/infra/kitty-proto"
aliases:
  - km-infra.kitty-proto
  - km-infra-kitty-proto
created_by: claude:536645b5
created_at: 2026-02-19T17:06:35Z
closed_at: 2026-02-20T13:40:58Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Add kitty keyboard protocol support to inkx @km/infra #feature #P3 @claude:8f007ba9

Enable the kitty keyboard protocol (CSI u) in inkx so the app can distinguish Cmd/Super from other modifiers. This unlocks Cmd+key bindings (e.g., Cmd+i for detail pane toggle) that aren't possible with legacy terminal input.

Supported terminals: Ghostty, Kitty, WezTerm, foot. Not supported: Terminal.app, iTerm2.

Implementation: inkx sends CSI > 1 u at startup to opt in, parses enhanced key reports. Graceful fallback for terminals that don't support it.

Context: Design discussion about keybindings for cursor-enter-card, detail pane toggle, zoom. Cmd+key would provide clean, unambiguous bindings without Alt/Esc timeout issues.

