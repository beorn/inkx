---
id: "@km/all/kb-string-syntax"
aliases:
  - km-all.kb-string-syntax
  - km-all-kb-string-syntax
created_by: claude:aee18a0e
created_at: 2026-02-27T13:11:56Z
closed_at: 2026-03-04T00:17:21Z
---

# [x] Keybinding string syntax: replace modifier props with string keys (⌃t or ctrl-t) @km/all #task #P3 @claude:f47d1ff0

Currently keybindings use property-based modifiers: { key: "t", ctrl: true, cmd: false }. Change to string-based key syntax using macOS symbols (⌃⇧⌘⌥) or dash notation (ctrl-shift-cmd-opt). Affects: Keybinding interface, registerKeybinding(), matchBinding(), resolveKeybinding(), all binding definitions.