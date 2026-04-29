---
id: "@km/tui/quality-plateau/pipe-composition"
aliases:
  - km-tui.quality-plateau.pipe-composition
  - km-tui-quality-plateau-pipe-composition
created_by: Bjørn Stabell
created_at: 2026-04-06T16:42:39Z
---

# [ ] Migrate event handling to pipe() composition (driver, board-app, tui) @km/tui #task #P3

3 TODOs referencing pipe() composition migration:
- driver.ts:220 — TODO(@km/_orphan/canonical): Use pipe() with withFocus()
- board-app.ts:992 — Migrate to pipe() composition
- tui.tsx:337 — Similar pipe() migration
Depends on silvery interactions-runtime providing stable pipe() API.