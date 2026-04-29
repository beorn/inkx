---
id: "@km/tui/omnibox-pre-select"
aliases:
  - km-tui.omnibox-pre-select
  - km-tui-omnibox-pre-select
created_by: Bjørn Stabell
created_at: 2026-04-14T23:26:04Z
---

# [ ] Cursor pre-select — propagate focused pane's cursor into new dialog (Phase 8) @km/tui #task #P1

blocks:: [[@km/tui/omnibox-interactions]], [[@km/tui/omnibox-unified]]

Phase 8: ensure cmd-k / cmd-f / g-chords / l-g propagate the previously-focused pane's cursor into selectedArgument at open time. Feature-flag behind a config option for the first release in case it's confusing.

Phase 6 handles the read side (currentCursor() routes through focus); this bead handles the write side (pre-seeding selectedArgument from the prior cursor).

Acceptance:
(a) cmd-k opens with selectedArgument = prior pane's cursor
(b) cmd-f opens with selectedArgument = prior pane's cursor  
(c) cmd-k → Enter becomes a no-op re-focus (the default command on the current cursor is goto → same cursor)
(d) cmd-f → Shift+Enter runs create_at against the current cursor
(e) feature flag (config option) disables pre-select for users who find it confusing