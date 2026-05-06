---
mentions:
  - km
id: "@km/inbox/7hfik"
aliases:
  - km-7hfik
  - "@km/_orphan/7hfik"
created_by: Bjørn Stabell
created_at: 2026-04-06T06:20:26Z
closed_at: 2026-04-06T06:55:04Z
owner: bjorn@stabell.org
---

# [x] Move interaction state machines into silvery runtime (selection as infrastructure) @km/_orphan #chore #P1

Move interaction state machines from @silvery/ag-term to @silvery/headless. Replace the hook+provider API with app plugins composed via existing pipe() primitive. Each plugin is independently opt-in and adds a single feature to the app object.

## Background

The text selection feature (@km/silvery/pointer-interaction tracking, @km/silvery/user-select Phase 1) was implemented but does NOT actually work:

- km has userSelect props on 15+ components — they are decorative because no code reads them
- vendor/silvery/examples/apps/text-selection-demo.tsx is a visual mockup using useInput keyboard toggles — it never calls useTerminalSelection, never wires mouse handlers, never actually selects anything
- Neither the demo author nor the km integration could figure out how to wire the hooks end-to-end

Root cause: interaction features were built as React hooks users must wire manually. useTerminalSelection returns handleMouseDown/Move/Up functions the user has to call on Box onMouseDown props. There is no global mouse dispatcher that reads userSelect and drives selection.

## Verified: the four state machines are already pure and independent

Grep confirms zero cross-imports between selection.ts, pointer-state.ts, find.ts, copy-mode.ts. They only share primitive types (Position, SelectionRange). They match @silvery/headless\'s stated purpose exactly: pure (action, state) → state functions with no React, no rendering, no side effects. Headless already contains readline.ts, select-list.ts, and the createMachine<S,A> observable container primitive.

## Verified: silvery already has the right composition primitive

vendor/silvery/packages/create/src/pipe.ts defines:

- AppPlugin<A, B> = (app: A) => B
- pipe(base, p1, p2, ...) composes plugins left-to-right

Existing usage: pipe(createApp(store), withReact(<Board/>), withTerminal(process), withFocus(), withDomEvents()). We slot withSelection(), withFind() etc into this same pattern. Zero new primitives needed.

## Design: three layers with crisp boundaries

### Layer 1: @silvery/headless — pure machines

Files moved FROM ag-term/src/ TO headless/src/:

- selection.ts — text selection range state machine
- pointer-state.ts — gesture disambiguation state machine
- find.ts — buffer search state machine
- copy-mode.ts — keyboard-driven selection state machine

Files that stay in ag-term/src/ (they are backend-specific):

- selection-renderer.ts — applies cell-style composition to TerminalBuffer (depends on TerminalBuffer)
- mouse-events.ts — parses SGR mouse protocol, owns hitTest (depends on terminal I/O)

Shared primitive types (Position, SelectionRange, SelectionScope, SelectionGranularity, ExtractTextOptions) go into headless/types.ts OR stay with their owning machine file — whichever has lower reshuffle. Decision: stay with owning file, re-exported from headless/index.ts.

The four machines use createMachine<S,A> from headless/machine.ts — they export (update, createInitialState) pairs. createMachine wraps them into an observable container. Both the pure reducer and the machine factory are exported for flexibility (pure reducers for testing, createMachine for runtime).

### Layer 2: Backend adapters — @silvery/ag-term/plugins/

New directory: packages/ag-term/src/plugins/. Each plugin file exports a factory function that:

1. Takes no required arguments (optional config object)
2. Returns an AppPlugin<App, App & { feature: ObservableState }>
3. The plugin function subscribes to runtime events on mount, cleans up on unmount
4. Drives the headless machine by dispatching actions
5. Applies backend-specific output (buffer overlay, keybinds, etc.)

Plugin files (exact count: 4):

- with-selection.ts — createMachine(selectionUpdate) + subscribe to mouse events via mouse-events dispatcher + write selection to buffer overlay via selection-renderer + Alt+drag override handling + OSC 52 copy on mouseup (when copyOnSelect option set). Adds app.selection: Observable<TerminalSelectionState>.
- with-find.ts — createMachine(findUpdate) + keybind Ctrl+F toggle + render find bar overlay + buffer search integration + n/N navigation + Enter to set selection (requires with-selection to also be installed — soft dependency via optional property check). Adds app.find: Observable<FindState>.
- with-copy-mode.ts — createMachine(copyModeUpdate) + keybind Esc+v toggle + h/j/k/l/v/V/y navigation + shares selection observable (requires with-selection). Adds app.copyMode: Observable<CopyModeState>.
- with-drag-drop.ts — drives pointer-state machine for drag gestures + uses isDropTarget/findDropTarget from ag-term's drag-events.ts + dispatches onDragEnter/Leave/Over/Drop to nearest ancestor. Adds app.drag: Observable<DragState|null>.

Plugin type shape:

type InteractionPlugin<Name extends string, State> = AppPlugin<
    App,
    App & { [K in Name]: Observable<State> }

> 

Example concrete type:
  type WithSelection = AppPlugin<App, App & { selection: Observable<TerminalSelectionState> }>

### Layer 3: @silvery/ag-react — no changes to composition, only deletions

createApp and pipe() already exist and already support this. Users write:

const app = pipe(
    createApp(store),
    withReact(<App/>),
    withTerminal(term),
    withSelection(),
    withFind(),
  )
  await app.run()

Or via run() for simple cases (add plugins option):

await run(<App/>, term, { plugins: [withSelection(), withFind()] })

The run() helper just calls pipe internally with the provided plugins in order.

### Read-only observer hooks (kept, new small file each)

Created in @silvery/ag-react/hooks/:

- useSelection(): TerminalSelectionState | null — reads from app.selection context
- useFindState(): FindState | null — reads from app.find context
- useCopyModeState(): CopyModeState | null — reads from app.copyMode context
- useDragState(): DragState | null — reads from app.drag context

These return null when the plugin is not installed (graceful degradation). They return state only — no handlers. Used by apps that want to render custom UI (copy indicators, selection counters, drag previews).

Context wiring: each plugin mounts a React context provider under withReact. The observer hook reads from it via useContext. Context is null when plugin not installed.

## Props are the entire control surface for most users

Users set props on Box/Text to control behavior:

- userSelect: "auto" | "none" | "text" | "contain" (exists)
- draggable: boolean (exists)
- onCopy?: (text: string, range: SelectionRange) => string | void — nearest ancestor wins, bubbles like onClick. Return value (if string) replaces the plain text going to clipboard; return void/undefined sends plain text.
- onPaste?: (event: PasteEvent) => void — nearest ancestor wins
- onFind?: (query: string) => Promise<FindResult[]> — optional model-level search fallback for virtual lists

Public interaction API surface:

- 4 props on Box (userSelect exists, draggable exists, onCopy + onPaste new)
- 1 prop on Box (onFind) optional
- 4 plugin factories (withSelection, withFind, withCopyMode, withDragDrop)
- 4 read-only observer hooks (useSelection, useFindState, useCopyModeState, useDragState)
- ~6 types (TerminalSelectionState, SelectionRange, FindState, etc)

Total: ~18 public exports. Down from ~37 today (51% reduction, not the 90% I initially claimed — I was over-estimating).

## Deletion list (exact)

From vendor/silvery/packages/ag-react/src/hooks/:

- useTerminalSelection.tsx
- usePointerState.tsx
- useCopyMode.tsx — replaced by useCopyModeState (read-only)
- useCopyProvider.tsx
- usePaste.tsx
- usePasteEvents.ts
- useFindProvider.tsx
- useFind.tsx (the existing one — replaced by useFindState)

From vendor/silvery/packages/ag-term/src/:

- semantic-copy.ts (SemanticCopyProvider + CopyEvent type)

From vendor/silvery/packages/ag-term/src/clipboard.ts:

- createInternalClipboardBackend
- createCompositeClipboard
- ClipboardBackend interface
Keep: copyToClipboard, requestClipboard, parseClipboardResponse, createOsc52Backend

From vendor/silvery/packages/ag-react/src/exports.ts and hooks/index.ts:

- All references to the deleted hooks and providers
- TerminalSelectionProvider, CopyProvider, PasteProvider, FindProviderComponent components
- SemanticCopyProvider, CopyEvent, ClipboardData types (keep PasteEvent for onPaste signature)
- UseTerminalSelectionResult, UseFindResult, UseCopyModeResult types

Count: 8 hooks deleted, 4 providers deleted, 5 speculative types deleted, 2 speculative clipboard factories deleted. Total: 19 deletions.

## Test migration

Phase 2 moves the tests with the machines:

- vendor/silvery/tests/selection.test.ts — stays where it is, imports updated to @silvery/headless
- selection-granularity.test.ts — same
- selection-render.test.ts — stays (tests selection-renderer, which stays in ag-term)
- find.test.ts — imports updated to @silvery/headless
- copy-mode.test.ts — imports updated to @silvery/headless
- copy-mode-advanced.test.ts — same
- pointer-state.test.ts — imports updated to @silvery/headless

Phase 3 adds NEW integration tests in vendor/silvery/tests/plugins/:

- with-selection.integration.test.ts — mount withSelection, dispatch real mouse events via termless, assert selection state + buffer overlay
- with-find.integration.test.ts — mount withFind, send Ctrl+F keystrokes, verify find bar renders and navigation works
- with-copy-mode.integration.test.ts — mount with-copy-mode, send vim keystrokes, verify state transitions
- with-drag-drop.integration.test.ts — mount withDragDrop, drag across nodes, verify drop target events fire

Each plugin gets at least one integration test. Unit tests for machines stay in their current location.

## Phase plan (Update → Absorb → Purge → Remove → Fix)

### Phase 1: Update (docs and beads)

- Update @km/silvery/pointer-interaction description to reference this bead as the implementation strategy
- Update @km/silvery/user-select to note that Phase 1 is superseded by this refactor
- Update vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md to match the new design (plugins, not hooks)
- DO NOT update silvery.dev guide pages yet (they reference deleted hooks) — defer to Phase 6

/complete criteria:

- bd show @km/silvery/pointer-interaction | grep -q '@km/_orphan/7hfik' (cross-reference exists)
- grep -q 'withSelection' vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md

### Phase 2: Move pure machines to @silvery/headless (no temporary re-exports)

Order:

1. Copy selection.ts, pointer-state.ts, find.ts, copy-mode.ts from ag-term/src/ to headless/src/
2. Update headless/src/index.ts to export from new files
3. Update ag-term/src/index.ts to export the machines from @silvery/headless (permanent re-export for users who want to import them from ag-term — they are part of ag-term public API for now). Add comment: // Re-exported from @silvery/headless — machines are backend-agnostic
4. Update imports in test files to use @silvery/headless (grep for 'from "./selection"' etc in tests)
5. Update imports in selection-renderer.ts, drag-events.ts, mouse-events.ts, semantic-copy.ts to use @silvery/headless
6. Update imports in useTerminalSelection.tsx, useFind.tsx, etc to use @silvery/headless
7. Delete the old files from ag-term/src/ (CRITICAL: per refactoring lessons, copy without delete = debt)
8. Run tsc, fix any remaining imports
9. Run bun vitest run vendor/silvery — all existing tests must pass

/complete criteria (RUN before closing phase, not after):

- ls vendor/silvery/packages/ag-term/src/selection.ts → not found
- ls vendor/silvery/packages/ag-term/src/pointer-state.ts → not found
- ls vendor/silvery/packages/ag-term/src/find.ts → not found
- ls vendor/silvery/packages/ag-term/src/copy-mode.ts → not found
- ls vendor/silvery/packages/headless/src/selection.ts → found
- ls vendor/silvery/packages/headless/src/pointer-state.ts → found
- ls vendor/silvery/packages/headless/src/find.ts → found
- ls vendor/silvery/packages/headless/src/copy-mode.ts → found
- bun vitest run vendor/silvery/tests/selection.test.ts → pass
- bun vitest run vendor/silvery/tests/find.test.ts → pass
- bun vitest run vendor/silvery/tests/copy-mode.test.ts → pass
- bun vitest run vendor/silvery/tests/pointer-state.test.ts → pass
- grep -r 'from "./selection"' vendor/silvery/packages/ag-term/src → 0 hits (selection-renderer.ts must import from @silvery/headless)
- grep -r 'from "./find"' vendor/silvery/packages/ag-term/src → 0 hits

### Phase 3: Create ag-term plugins

Create vendor/silvery/packages/ag-term/src/plugins/ with:

- index.ts — exports all plugin factories
- with-selection.ts
- with-find.ts
- with-copy-mode.ts
- with-drag-drop.ts

Each plugin:

1. Accepts an options object (all fields optional with sane defaults)
2. Returns AppPlugin that adds an observable state to the app
3. Subscribes to the runtime\'s event bus in the mount lifecycle
4. Cleans up subscriptions in the dispose lifecycle
5. Exposes a React context for the observer hooks to read

Each plugin has one integration test in vendor/silvery/tests/plugins/.

Update ag-term public barrel (vendor/silvery/packages/ag-term/src/index.ts) to export the plugin factories.

/complete criteria:

- ls vendor/silvery/packages/ag-term/src/plugins/ → 5 files (index + 4 plugins)
- ls vendor/silvery/tests/plugins/ → 4 integration test files
- grep 'export.*withSelection' vendor/silvery/packages/ag-term/src/index.ts → 1 hit
- bun vitest run vendor/silvery/tests/plugins → all 4 pass

### Phase 4: ag-react observer hooks + run() plugins option

Create 4 small read-only hooks:

- vendor/silvery/packages/ag-react/src/hooks/useSelection.ts
- vendor/silvery/packages/ag-react/src/hooks/useFindState.ts
- vendor/silvery/packages/ag-react/src/hooks/useCopyModeState.ts
- vendor/silvery/packages/ag-react/src/hooks/useDragState.ts

Each is <30 lines: useContext + return state.

Update vendor/silvery/packages/ag-term/src/runtime/run.tsx to accept a plugins option and thread it into pipe().

Update ag-react hooks barrel to export the 4 new observer hooks.

/complete criteria:

- ls vendor/silvery/packages/ag-react/src/hooks/useSelection.ts → found
- grep 'plugins' vendor/silvery/packages/ag-term/src/runtime/run.tsx → plugins param handled
- Write and pass ONE integration test that does: run(<Box userSelect="text"><Text>hello</Text></Box>, term, { plugins: [withSelection()] }) and dispatches a mouse drag, then asserts useSelection() returns a non-null range. This test is the critical proof that the design works end-to-end.

### Phase 5: Purge (delete old API)

Delete in this exact order, using tsc errors as guide at each step:

1. Delete useTerminalSelection.tsx → tsc will show callers → either fix to use observer hook or delete
2. Delete usePointerState.tsx
3. Delete useCopyMode.tsx (the old handler-returning one)
4. Delete useCopyProvider.tsx and CopyProvider export
5. Delete usePaste.tsx and PasteProvider export
6. Delete usePasteEvents.ts
7. Delete useFindProvider.tsx and FindProviderComponent export
8. Delete the OLD useFind.tsx (replaced by useFindState observer)
9. Delete semantic-copy.ts
10. Delete createInternalClipboardBackend from clipboard.ts
11. Delete createCompositeClipboard from clipboard.ts
12. Delete ClipboardBackend interface from clipboard.ts
13. Remove all deleted names from ag-react exports.ts, hooks/index.ts, index.ts
14. Remove all deleted names from ag-term index.ts
15. Update the existing ag-react demo (if any references the deleted hooks) — fix or delete

After each delete, run tsc and fix all errors in a single pass. Commit after every successful tsc run.

NO BACKWARDS COMPAT RE-EXPORTS. Per refactoring lessons, no @deprecated shims, no re-exports, no fallback patterns.

/complete criteria (MUST RUN each grep literally):

- grep -rn 'useTerminalSelection' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits (excluding CHANGELOG)
- grep -rn 'usePointerState' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'useCopyProvider\|useCopyMode\b\|CopyProvider' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'usePaste\|PasteProvider\|usePasteEvents' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'TerminalSelectionProvider\|FindProviderComponent' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'SemanticCopyProvider\|semantic-copy' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'createCompositeClipboard\|createInternalClipboardBackend' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- bun vitest run vendor/silvery → all pass

### Phase 6: Fix — wire demo + km + docs + README

1. Rewrite vendor/silvery/examples/apps/text-selection-demo.tsx:
  - Remove the fake useInput-based state
  - Wrap in a run() call with plugins: [withSelection(), withFind()]
  - Use useSelection() for the copy indicator
  - Verify manually by running the demo and mouse-dragging
2. Update apps/@km/tui/src/tui.tsx:
  - Add plugins: [withSelection()] to the boardApp.run() call
  - No other km changes needed — the existing userSelect=contain props will start working
3. Update silvery.dev guide pages:
  - vendor/silvery/docs/guide/text-selection.md — replace useTerminalSelection examples with withSelection plugin examples
  - vendor/silvery/docs/guide/clipboard.md — simplified (OSC 52 only, onCopy prop instead of SemanticCopyProvider)
  - vendor/silvery/docs/guide/find.md — withFind plugin usage
4. Update vendor/silvery/CHANGELOG.md:
  - New entry: "Interaction plugins (withSelection, withFind, withCopyMode, withDragDrop) — text selection, find, copy-mode, drag-and-drop as opt-in plugins attached via pipe()"
  - Breaking: "Removed useTerminalSelection, useCopyProvider, PasteProvider, and other hook/provider APIs. Use plugins and observer hooks instead."
5. Update vendor/silvery/README.md:
  - Mention text selection and find as features
  - Add a plugin example to the getting started section
6. Update vendor/silvery/docs/index.md (homepage):
  - Add interaction plugins to the feature list
7. Manual verification:
  - Run the demo: bun vendor/silvery/examples/apps/text-selection-demo.tsx → mouse drag selects text → mouse up copies to clipboard → pasting into an external editor yields the selected text
  - Run km: bun km view /some/vault → open help dialog (?) → mouse drag on help text → selection highlights → mouse up copies → pasting yields the text

/complete criteria:

- grep -q 'withSelection' vendor/silvery/examples/apps/text-selection-demo.tsx
- grep -q 'withSelection' apps/@km/tui/src/tui.tsx
- grep -q 'withSelection' vendor/silvery/docs/guide/text-selection.md
- grep -q 'useTerminalSelection' vendor/silvery/docs/guide/text-selection.md → 0 (old API removed)
- Manual verification passed for both demo and km

## Risks and mitigations

1. **Plugin subscribing to runtime events during mount lifecycle** — need to verify the runtime exposes a subscription API. May require small addition to ag-term runtime. Research in Phase 3 before committing to full design. Mitigation: if runtime doesn't expose events, plugins use a shared event dispatcher created in withTerminal().
2. **Context nesting for observer hooks** — plugins need to provide React context under withReact so observer hooks can read them. Verify this ordering works. Mitigation: test context visibility in Phase 4.
3. **with-find depends on with-selection** (soft) — Ctrl+F + Enter uses selection to highlight the match. Plugin should detect whether app.selection exists at mount time and error loudly if not. Mitigation: type the dependency via AppPlugin's input type (withFind: AppPlugin<App & {selection:...}, App & {selection:..., find:...}>).
4. **Tests for plugins use termless** — the integration tests need a real terminal emulator to dispatch mouse events. @silvery/test provides createTermless. Verify it supports mouse event injection. Mitigation: if not, add mouse event injection to termless (separate small task).
5. **drag-events.ts split** — types move to @silvery/ag/drag-event-types.ts (already there), runtime state (DragState factory, isDropTarget, findDropTarget) stays in ag-term as part of with-drag-drop plugin internals.
6. **Rendering interaction with selection-renderer.ts** — selection-renderer stays in ag-term but must be called from the plugin. Plugin creates the selection machine, subscribes, and on every state change applies the renderer to the TerminalBuffer via the existing output pipeline. Verify where in the pipeline the overlay should hook in (probably a new hook in the output phase).

## Dependencies

Blocks: @km/silvery/pointer-interaction, @km/silvery/user-select
Depends on: nothing

## Why this is pre-v1 and must ship before launch

The current state ships: 385 tests of pure state machines, no way to actually use them from userland, and a demo that lies about what works. Shipping this would require either maintaining parallel APIs (hooks AND plugins) forever or a breaking migration post-launch. Doing it now is additive + deletion, no migration story needed.

## Notes

- Per refactoring lessons: delete old code first (or in the same commit as the new code), no @deprecated, no shims, no backwards compat.
- Per refactoring lessons: every /complete criterion must be run literally with grep before closing the phase. Paste command output.
- Per refactoring lessons: if scope grows during a phase, UPDATE the bead, don't close with drift.

LABELS: architecture, selection, silvery, simplification

