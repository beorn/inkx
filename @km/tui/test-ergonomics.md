---
mentions:
  - km
  - Bjørn
id: "@km/tui/test-ergonomics"
aliases:
  - km-tui.test-ergonomics
  - km-tui-test-ergonomics
created_by: Bjørn Stabell
created_at: 2026-04-01T23:30:43Z
closed_at: 2026-04-02T19:35:20Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Test ergonomics: editNode/setUI/expectState helpers + migrate all tests @km/tui #task #P2 @Bjørn Stabell

Add fluent test helpers to board-test.ts and migrate all 22 test files to use them.

## New Helpers (in createFluentBoardApi)

1. board.editNode(nodeId, opts?) — enter edit mode on any node (incl sub-sections)
- Encapsulates store.getState().setUI({ inlineEditBlock: ... }) + flush
- opts: { block?: number, card?: string }
5. board.setUI(partial) — thin proxy for store.setUI with auto-flush
- Eliminates store.getState().setUI() + board.press("") pattern
8. board.expectEditing(nodeId?) / board.expectNotEditing()
- Replaces getActiveBoardPane(store.getState())?.inlineEditBlock checks
11. board.expectState({ editing?, viewMode?, filterText?, cursor? })
- Declarative assertion over pane state
- Replaces 313 getActiveBoardPane chains across 22 files

## Migration

After implementing helpers, migrate ALL existing tests:

- Replace 17 raw store.getState().setUI({ inlineEditBlock: ... }) calls
- Replace 313 getActiveBoardPane(store.getState()) assertion chains
- Remove getActiveBoardPane imports where no longer needed
- Convert verbose sequences to fluent chains where natural

## Evidence of completion

- Zero remaining raw store.getState().setUI({ inlineEditBlock }) in tests
- Zero remaining getActiveBoardPane imports used only for assertions
- bun run test:fast passes

