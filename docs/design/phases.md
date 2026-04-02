# TEA State Machine Phases

Roadmap for migrating km's interactive subsystems to pure state machines following the TEA shape: `(state, op) -> [state, effects]`. Full design in [tea-state-machines.md](tea-state-machines.md).

## Phase 1: PlainText — character-level editing

**Status:** Not started
**Scope:** Extract `PlainText.apply(state, op)` from silvery's `readline-ops.ts` / `useReadline.ts`. Pure noun-singleton, zero dependencies, no React.

Key deliverables:
- `PlainText.apply()`, `PlainText.opFromKey()`, `PlainText.create()`
- `usePlainText()` hook wrapping in React state
- TextInput/TextArea driven mode (`state` + `onOp` props)
- Kill ring via effects (`kill_ring_push` effect, app-level state)

What it enables:
- Testable text editing without React
- Shared editing logic between silvery components and km
- Foundation for the `.apply()` pattern used by all subsequent phases

Key files (current):
- `vendor/silvery/packages/ag-react/src/hooks/readline-ops.ts` -- readline editing logic (to be extracted)
- `vendor/silvery/packages/ag-react/src/ui/components/useReadline.ts` -- hook wrapper
- `vendor/silvery/packages/ag-react/src/ui/components/useTextArea.ts` -- TextArea hook

## Phase 2: App Machines — Board, Dialog, Search

**Status:** In progress (navigation reducer + history plugin shipped)
**Scope:** Extract pure noun-singletons with `.apply()` for each app domain. Replace Zustand imperative mutations with composed pure machines.

Key deliverables:
- `Board.apply()` -- cursor, navigation, fold/unfold, multi-select
- `Dialog.apply()` -- open/close/confirm dialogs
- `Search.apply()` -- query, results, selection
- `withHistory` plugin -- undo/redo via operation recording (implemented and tested, not yet wired into live app)

What it enables:
- Testable app state transitions without React or repos
- Machines communicate via effects (`{ type: "dispatch", target, op }`)
- Foundation for undo/redo across the app

Key files (current):
- `apps/km-tui/src/board/board-reducer.ts` -- Board navigation state machine (Phase 2a, shipped)
- `apps/km-tui/tests/board-reducer.test.ts` -- pure reducer tests
- `apps/km-tui/src/board/board-actions.ts` -- remaining imperative dispatch (to be migrated)
- `apps/km-tui/src/board-app-store.ts` -- Zustand store (to be wired through `tea()`)

Runtime support:
- `vendor/silvery/packages/create/src/tea/index.ts` -- silvery/tea Zustand middleware (shipped)

## Phase 3: SlateJS Integration — per-node body editing

**Status:** Planned
**Scope:** Integrate SlateJS as the rich text body editor for individual nodes. On terminal: slate headless + silvery rendering adapter. On web: slate + slate-react.

Key deliverables:
- SlateJS as body editor engine (paragraphs, inline formatting, lists, code blocks)
- Silvery rendering adapter for terminal display
- Kill ring integration via the same effect pattern as PlainText
- Selection bridge between Tree-level selection and SlateJS internal cursor

What it enables:
- Rich text editing within node bodies (bold, italic, block structure)
- Shared editing engine across terminal and web
- Path-based addressing within bodies (fine at body scope)

## Phase 4: Tree — document tree model

**Status:** Planned
**Scope:** Full document tree state machine with undo, lazy loading, CRDT-ready operations. Manages the km node hierarchy (boards, columns, items, sub-items). Does NOT manage body content within individual nodes (that is SlateJS).

Key deliverables:
- `Tree.apply(tree, op)` -- 9 SlateJS-compatible structural operation types (ID-based)
- `Tree.nodes()`, `Tree.above()`, etc. -- pure query surface
- `withHistory` plugin -- undo/redo via invertible operations
- Lazy content loading via `load_children` operations
- Triple selection model (TextSelection, NodeSelection, GapSelection)
- CRDT-first storage via Automerge

What it enables:
- Collaborative editing (operations are CRDT-native via ID-based addressing)
- Undo/redo at the document level
- Lazy loading without special infrastructure
- Portable document model (terminal, web, tests, AI automation)

## Phase Progression

```
Phase 1 (planned)    PlainText.apply()     single plain text, cursor, readline
Phase 2 (in progress) Board/Dialog/Search  app machines as pure noun-singletons
Phase 3 (planned)    SlateJS integration   per-node body editing (rich text)
Phase 4 (planned)    Tree.apply()          document tree, undo, CRDT
```

Each phase is independently useful. Phase 1 improves silvery components. Phase 2 improves km-tui testability. Phase 3 enables rich text editing. Phase 4 enables the full document model with collaboration.

Phases are not strictly sequential -- Phase 2 is in progress without Phase 1 being complete. The ordering reflects dependency (later phases build on patterns established by earlier ones) and complexity (character editing is simpler than document trees).
