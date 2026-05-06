---
mentions:
  - km
id: "@km/silvery/tea/migration"
aliases:
  - km-silvery.tea.migration
  - km-silvery-tea-migration
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:38Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea.migration
    depends_on_id: km-silvery.tea-gap-substrate-merge
    type: blocks
    created_at: 2026-04-21T15:27:13Z
    created_by: claude:c1c8afe1
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea-gap-substrate-merge
---

# [ ] Era2b Phase 7: km migration — tea to new packages @km/silvery #task #P2

blocks:: [[@km/silvery/tea-gap-substrate-merge]]

Migrate km to silvery TEA packages (@silvery/commands, @silvery/signals, @silvery/headless).

This is the BRIDGE between @km/silvery/tea (framework) and @km/tui/tea (domain).
Adopt silvery's TEA packages in km, then @km/tui/tea builds domain machines on top.

Depends on:

- @km/silvery/tea-aichat (phase 3 — framework TEA finalized)

Order: commands first (replace manual key handlers), then signals, then model.
Read docs/lessons/refactoring.md before starting.

