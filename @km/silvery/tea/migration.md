---
id: "@km/silvery/tea/migration"
aliases:
  - km-silvery.tea.migration
  - km-silvery-tea-migration
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:38Z
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