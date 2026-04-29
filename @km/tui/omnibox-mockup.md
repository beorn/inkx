---
id: "@km/tui/omnibox-mockup"
aliases:
  - km-tui.omnibox-mockup
  - km-tui-omnibox-mockup
created_by: Bjørn Stabell
created_at: 2026-04-14T23:23:11Z
---

# [ ] Omnibox static mockup app — 6+ scenes showing dialog forms, operators, filters @km/tui #task #P1

blocks:: [[@km/tui/omnibox-unified]]

Static Silvery app rendering the omnibox in each design state. Real components, real theme tokens, non-functional (stepped via n/p). Located at apps/@km/tui/src/views/omnibox/mockup.tsx; run via 'bun apps/@km/tui/src/views/omnibox/mockup.tsx'. Output termless snapshots to docs/design/mockups/ as canonical reference.

Scenes (6+ matching the design doc mockups):
1. cmd-k — command-first, sticky cursor pre-selected. buffer=':'. Command list filtered by when(cursor).
2. cmd-f — object-first, same sticky cursor. buffer=''. Argument search over all.
3. cmd-f then typed '@del' — context search with match highlighting. Shows @delei ranked top, deep subpath last.
4. cmd-k on a selected argument — action panel pattern. Shows commands filtered by when for the selected argument.
5. sigil auto-replace — buffer ':cr' typed, then '@' → becomes '@cr'. Swap modes mid-stream.
6. / bottom-left — local find layout. In-place match highlighting on board.
7. query-syntax showcase — '[] due::today @me urgent -resolved' with live parse chips.
8. pop-out pane preview — same component docked as pane. (post-v1 scene, optional.)

Each scene documents its base state ({buffer, defaultCommand, selectedArgument}) in the footer for inspection.

Acceptance:
(a) Mockup app exists at apps/@km/tui/src/views/omnibox/mockup.tsx
(b) 6+ scenes render correctly in a real terminal (Ghostty)
(c) n/p keys step through scenes
(d) Termless snapshots committed to docs/design/mockups/
(e) Linked from omnibox.md