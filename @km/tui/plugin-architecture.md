---
mentions:
  - km
id: "@km/tui/plugin-architecture"
aliases:
  - km-tui.plugin-architecture
  - km-tui-plugin-architecture
created_by: Bjørn Stabell
created_at: 2026-04-01T19:30:06Z
owner: bjorn@stabell.org
---

# [ ] Plugin architecture: composition, validation, commands — align with era2 vision @km/tui #epic #P2

## Plugin Architecture Refactor — Phased Plan

### Current Status (Session 0401b)

Phase 0: DONE (prev session)
Phase 0.5a: IN PROGRESS — schema-fixes agent running (worktree)
Phase 0.5b: BLOCKED on 0.5a — item-as-object (1,723 refs, 146 files, NO DB migration needed)
Phase 1: BLOCKED on 0.5b — Board.apply extraction (75 handlers, 5,300 lines)
Research: DONE — blast radius + Board.apply architecture analyzed

### Key Decisions

- item-as-object: Keep flat DB columns, change TypeScript mapping only
- Board.apply: Incremental extraction (1a navigation → 1b UI → 1c mutations)
- Board.apply 1a can run parallel with item-as-object (different files)

### Plugin Composition Order

repo → withTree → withValidation → withHistory → withOutliner → withCursor → withBoard → app

### Phases

Phase 0: Infra + Design (DONE)
Phase 0.5a: 6 schema fixes + schema layer (IN PROGRESS)
Phase 0.5b: item-as-object migration
Phase 1: Board.apply() pure state reducer
Phase 2: History/Transactions
Phase 3: Outliner reshape
Phase 4: Docs consistency
Phase 5: Shared executable fixtures

