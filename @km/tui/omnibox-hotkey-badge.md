---
id: "@km/tui/omnibox-hotkey-badge"
aliases:
  - km-tui.omnibox-hotkey-badge
  - km-tui-omnibox-hotkey-badge
created_by: Bjørn Stabell
created_at: 2026-04-15T06:07:28Z
closed_at: 2026-04-15T06:15:36Z
close_reason: "Fixed in 504bf996b. Replaced the hardcoded hotkey=':' with a
  mode-derived lookup table (modeChrome) that produces title + hotkey +
  placeholder in sync. : → :, @ → @, # → #, + → +, / → /, universal → empty
  hotkey. Also deleted the dead 'node' mode branch from the ternary."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-hotkey-badge
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T23:07:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Omnibox title hotkey badge always shows [:] — should reflect current sigil @km/tui #bug #P2

blocks:: [[@km/tui]]

User feedback: 'the omnibox title always shows [:] — it should show whatever the keybinding would be that would open it — [#] [/] [+] [@]'.

The hotkey badge next to the title is currently hardcoded to ':' in the ModalDialog hotkey prop:

  <ModalDialog title={title} hotkey=':' ... />

It should derive from the same sigil the title label uses. When mode is 'command' → ':', 'tag' → '#', 'project' → '+', 'context' → '@', 'local_find' → '/', 'universal' → '' (or no badge).

Fix site: apps/@km/tui/src/views/Omnibox.tsx around the title derivation I added in commit bc33ae089. Pass the derived hotkey alongside the derived title.

Related: @km/tui/omnibox-quality-plateau