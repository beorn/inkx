---
mentions:
  - km
  - Bjørn
id: "@km/tui/initial-column-height"
aliases:
  - km-tui.initial-column-height
  - km-tui-initial-column-height
created_by: Bjørn Stabell
created_at: 2026-04-18T18:12:19Z
closed_at: 2026-04-18T18:43:06Z
close_reason: "Fixed in 0d1eb0188 by passing explicit cols/rows + stdout to
  silvery at mount, eliminating the two-reader race on terminal dimensions (km
  reads at line 297, silvery re-read ~300ms later after config load and OSC
  theme detection — if they disagreed, board rendered at wrong height until
  SIGWINCH resynced). Defensive fix: couldn't reproduce the exact symptom in a
  termless harness, but the race is real and this closes it. Full km-tui suite:
  only the 5 pre-existing omnibox failures remain; column-rendering md-file test
  went from failing to green. See task notification from worktree agent
  a3d0ec07a for the detailed trace of where the two reads happen."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.initial-column-height
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T11:12:19Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Board first-render uses wrong column height — fixes on resize @km/tui #bug #P1 @Bjørn Stabell

blocks:: [[@km/tui]]

Column rendered at ~half the real terminal height on first paint, with items disappearing when cursoring down. Fixes itself when the terminal is resized (SIGWINCH re-measures). Likely initial-measure race: React mounts before silvery resolves the real terminal size. See screenshot ~/Desktop/Screenshot 2026-04-18 at 11.09.20.png.

