---
id: "@km/all/kb-cmd"
aliases:
  - km-all.kb-cmd
  - km-all-kb-cmd
created_by: claude:536645b5
created_at: 2026-02-20T15:48:00Z
closed_at: 2026-02-20T18:50:33Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Keybinding v2: Cmd shortcuts via kitty protocol (Cmd+d/f/k/N) @km/all #task #P3 @claude:d3a7049b

Wire up Cmd+key shortcuts using kitty protocol (@km/infra/kitty-proto done). Cmd+d (duplicate), Cmd+f (search/replace dialog), Cmd+k (omnibox), Cmd+N (new window), Cmd+s (save), etc. Falls back to Alt on non-kitty terminals. See docs/keybindings-v2.md §Cmd Shortcuts.