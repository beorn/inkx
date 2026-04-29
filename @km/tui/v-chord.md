---
id: "@km/tui/v-chord"
aliases:
  - km-tui.v-chord
  - km-tui-v-chord
created_by: claude:28b14b32
created_at: 2026-02-23T11:49:55Z
closed_at: 2026-02-23T11:54:32Z
---

# [x] v-prefix chord: view/visual commands (v␣=visual, vv=cycle view, vV=icons, vc=collapse, vf=filter) @km/tui #feature #P2 @claude:28b14b32

Turn v into a chord prefix for view/visual commands. Consolidates scattered view bindings under one namespace.

Current bindings to migrate:
- v → visual_mode_enter → v <space>
- V → cycle_icon_style → v V
- g v → cycle_view_mode → v v
- g c → toggle_collapse → v c
- g C → toggle_show_ignored → v H (show hidden)
- ⌘g/⌃g → filter → v f

New bindings:
- v <space> = visual mode (was bare v)
- v v = cycle view modes (was g v)
- v V = cycle icons (was V)
- v c = toggle collapsed (was g c)
- v h = hide (new — needs command)
- v H = show hidden (was g C)
- v f = filter (was ⌘g/⌃g)

Note: bare v becomes chord prefix, so visual mode needs v<space>. Keep ⌘g/⌃g as aliases for filter.