---
id: "@km/tui/subitem-enter-noop"
aliases:
  - km-tui.subitem-enter-noop
  - km-tui-subitem-enter-noop
created_by: Bjørn Stabell
created_at: 2026-03-31T22:04:12Z
closed_at: 2026-03-31T22:12:23Z
close_reason: Same fix as km-tui.enter-creates-node-id — requestRenderFlush +
  synchronous column derivation.
---

# [x] Enter does nothing after typing subitem title @km/tui #bug #P2

User reports: hit Enter on card => inserts subitem, type text title for subitem, hit Enter => nothing happens.

Expected: Enter should commit the subitem title (exit inline edit) or create another subitem below.
Actual: Enter key is consumed with no visible effect.