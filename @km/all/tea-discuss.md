---
id: "@km/all/tea-discuss"
aliases:
  - km-all.tea-discuss
  - km-all-tea-discuss
created_by: claude:632692f2
created_at: 2026-04-20T20:42:13Z
closed_at: 2026-04-21T22:27:51Z
close_reason: Description self-describes as 'ADDS to km-tui.tea, does not
  replace' — not a distinct thread. Content covered by km-silvery.tea
  (framework) + km-tui.tea (consumer). Closing as duplicate.
---

# [x] TEA / apply-chain reference — ADDS to km-tui.tea, does not replace @km/all #task #P0

blocks:: [[@km/silvery/tea]]

# TEA / apply-chain design — captured discussion

Reference bead capturing the architecture discussion from session 2026-04-19 to 2026-04-20, including:
- what km is migrating from/to at the framework and domain levels
- how silvery's shipped apply-chain compares to classic TEA and Slate.js plugins
- why the signature is `apply(op) → false | Effect[]` (not `(state, op) → [state, effects]`)
- the full 5-stage input pipeline with per-event-type traces
- the honest tradeoffs (sharpened via external review)

Motivation: subsequent sessions on `km-silvery.tea.migration` and `km-tui.tea` keep rediscovering the same ground. This bead is the shared mental model so they don't.

---

## 1. Current km architecture (what we're migrating from)

`createBoardApp()` in `apps/km-tui/src/board/board-app.ts` uses `createApp<Store>` with four raw event handlers: `term:key` / `term:mouse` / `term:resize` / `term:focus`. The key path is:

```
term:key (silvery) → handleKey → command-bridge.processKeyWithContext
  → @km/commands.executeCommand → handleKmOp in board-actions.ts
  → imperative helpers mutating store (Zustand) + sel (@silvery/selection)
  + repo + dialog-guard globals + activeEditTargetRef (imperative ref)
  + UndoStack + UndoableRepo wrapper
```

State lives across:
- `BoardAppState.workspace.panes[]` (cursor, foldDepths, rootId, zoomStack, navHistory) — Zustand store
- `ui: UIState` mutated via `setUI()`
- `sel: SelectionStore` — dual `sel.text.*` / `sel.node.*` channels, 226 call sites × 20 files
- `Repo` wrapped by `UndoableRepo`
- `activeEditTargetRef` / `activeEditContextRef` / `textEditHints` — ref-based, imperative
- `ui.activeDialog` + `dialog-guard.ts` stack + `dialogTargetRef` global
- `UndoStack` + batched via `startBatch/endBatch`
- Persistence: watcher + materialization via `board-effect-runner.ts` + `config-persist.ts` + `workspace-persist.ts`

`board-reducer.ts` (890 LOC) is a PARTIAL TEA reducer — ~15% coverage, navigation only. Real shape `applyNavigation(state, op) → [state, effects]` exists there. `board-actions.ts:377` has an interpreter `applyBoardEffects(effects, ctx)`.

Centers of gravity (verified 2026-04-19):
- `board-actions.ts` 3010 LOC
- `board-app-store.ts` 1815
- `board-app.ts` 1291
- `board-reducer.ts` 890
- `board-actions-edit.ts` 778
- `use-board-dialogs.ts` 480
- `board-actions-nav.ts` 478
- `board-actions-zoom.ts` 450
- `undoable-repo.ts` 367

---

## 2. Target architecture (what we're migrating to)

**Pipe convention (canonical, do not reverse)**: **later in `pipe()` = outer in dispatch**. The last plugin added is the outermost wrapper — it sees ops FIRST and can consume or pass through to `prev(op)`. This matches silvery's shipped substrate (see `vendor/silvery/packages/create/src/core/index.ts` `compose()` comment and `runtime/base-app.ts` "last plugin applied = outermost"). The other form — `compose(pluginA, pluginB)` where `pluginA` is outermost — is an internal helper. In the canonical `pipe()` form used throughout km's TEA migration, read top-to-bottom = innermost-to-outermost.

```ts
const app = pipe(
  createApp(storeFactory),
  withDialogs(),   // innermost-owned modals (added first)
  withSelection(), // unified Selection union
  withEditor(),    // PlainText from @silvery/headless
  withTree(),      // structural ops
  withBoard(),     // nav, view modes, zoom, fold
  withUndo(),      // middleware wrapping tree + editor
  withStorage(),   // outermost — persist/sync effect lane (added last)
)

// Views read via signals:
app.useStore(selector)

// Tests / keymaps dispatch named commands:
app.cmd.cursor_down()
dispatch({ type: "enter_edit", nodeId })
```

Every interactive subsystem is a plugin owning a state slice, a command set, and an `apply` function. Plugins compose via `pipe()` — each plugin added to the pipe captures the previous `app.apply` as `prev` and replaces it with a wrapper. The last-added plugin is outermost; it runs first on each op and delegates via `prev(op)` when it doesn't handle. Effects are drained by the runtime via registered runners after the chain returns.

**Command naming — `app.cmd.<id>()`** is the canonical form (matches `vendor/silvery/packages/commands/src/with-commands.ts`). Historical design docs and early beads sometimes wrote `app.commands.board.cursor_down.fn()`; treat those as the same concept through the `withCommands` plugin, and use `app.cmd.<id>()` in new code, tests, and docs.

---

## 3. The apply-chain signature (what SHIPPED)

**Two layers, two signatures.** km's TEA architecture has an **inner** layer (pure domain reducers) and an **outer** layer (the plugin bus). They use different signatures by design:

| Layer | Signature | Who uses it | Bead |
|---|---|---|---|
| **Inner — domain reducers** | `(state, op) → [state, effects]` (classic TEA) | Called from inside a plugin to compute next slice state. Examples: `applyNavigation` in `board-reducer.ts`, `PlainText.apply`, `Tree.apply`, `Board.apply` | `km-all.tea-machines` (closed) defines this signature as universal for inner domain machines |
| **Outer — plugin bus / apply chain** | `apply(op) → false \| Effect[]` (middleware / chain-of-responsibility) | The cross-plugin dispatch contract that the silvery substrate ships | This bead (tea-discuss); the shipped `@silvery/create` substrate |

A plugin is typically: an outer `apply(op)` wrapper that owns a state slice privately (via closure over zustand `set`), possibly calling an inner `(state, op) → [state, effects]` reducer to compute the next slice state, then returning `Effect[]` (handled) or `false` (not mine — `return prev(op)`).

This is why `km-all.tea-machines` saying `(state, op) → [state, effects]` is "universal" and this bead saying the shipped contract is `apply(op) → false | Effect[]` are **both correct at different layers** — not a real contradiction. The machines bead was scoped to inner reducers; the plugin bus is a different contract.

From `vendor/silvery/packages/create/src/types.ts` (outer contract):

```ts
export type Op          = { type: string; [key: string]: unknown }
export type Effect      = { type: string; [key: string]: unknown }
export type ApplyResult = false | Effect[]
```

- `false` — not handled, pass through to next plugin (`prev(op)`)
- `Effect[]` — handled (empty array OK); here's what should happen next
- **Footgun**: `return []` means *handled with no effects*. A careless `return []` where `false` was intended silently swallows the op. The substrate documents this; plugins should only return `[]` when they've genuinely consumed the op.

Plugin shape:

```ts
const withDialogs: Plugin = (app) => {
  const prev = app.apply
  return {
    ...app,
    models: { dialogs: { activeDialog, stack, query } },
    commands: { open_search, close_dialog, toggle_console },
    apply(op) {
      if (op.type === "open_dialog")  { set({ activeDialog: op.which }); return [/*effects*/] }
      if (op.type === "close_dialog") { set({ activeDialog: null }); return [/*effects*/] }
      return prev(op)  // delegate — middleware composition
    },
  }
}
```

State mutation happens INSIDE the plugin via closure over `set` (its own zustand slice). Cross-plugin state is not passed through the signature.

---

## 4. Why `apply(op) → false | Effect[]` — not `(state, op) → [state, effects]`

Design rationale (from v1r prototype + shipped substrate):

1. **Plugins own their slice privately.** Each plugin wraps a zustand store slice and mutates via closure. Returning `state` in the signature would force every plugin to take/return the whole app state — doesn't compose when different plugins own disjoint parts.

2. **Middleware composition is trivial.** Outer plugin captures inner `app.apply`, replaces it with wrapper, delegates via `prev(op)`. With `state` in the signature you'd have to pipe state through every layer — more ceremony, more places to get ordering wrong.

3. **`false` is load-bearing.** It's how the chain knows "not mine, try the next plugin." With `[state, effects]` you have no way to say "pass through" without adding a third slot or a sentinel.

4. **Effects as data still gives SOME replay.** The `(op, effects)` log is enough to reconstruct a run, provided plugin ordering, init state, and determinism are fixed (see §6 tradeoffs).

5. **Per-plugin pure reducer is still possible internally.** Inside a plugin you can still do `state = reducer(state, op); set(state)` — that's fine. The cross-plugin contract is just `op → effects`.

Current legacy `board-reducer.ts` uses `(state, op) → [state, effects]` pure TEA. When absorbed into `withBoard()` (@km/tui/tea Phase 2), the outer signature flips to `apply(op) → false | Effect[]`; internal `applyNavigation(state, op) → [state, effects]` stays as a pure helper the plugin calls.

---

## 5. Compared to Slate.js plugins

| | Slate | Silvery apply-chain |
|---|---|---|
| Scope | One document editor | Whole app (dialogs, nav, storage, undo; editor = one plugin) |
| Pattern | Decoration (monkey-patch + closure delegate) | Middleware (outer wraps inner via prev capture) |
| State | Editor object (doc + selection + history) | `app.models` namespace — per-plugin slices |
| Mutation | In-place on editor | Via closure `set` on owned slice |
| Op set | Closed (Slate-owned) | Open (any plugin defines new ops) |
| Side effects | Inside `editor.apply(op)`, implicit | Returned as data, drained by runtime |
| Commands | Ad-hoc methods / Transforms | First-class registry — `app.cmd.<id>()` (a.k.a. `app.commands.*` in early design docs; same concept) |
| Extension points | `editor.apply`, `normalizeNode`, `isVoid`, `isInline`, `insertData`, etc. | Single `apply` hook + plugin's own commands/models |
| Method override | Multiple per plugin | Single chain point |

Intuition: Slate plugins teach **one editor** new tricks by monkey-patching methods. Silvery plugins teach **an app** new tricks by adding a TEA slice — commands, a reducer, effects, models. The Slate-equivalent in silvery is `withEditor()` (@km/tui/tea Phase 3, using `PlainText.apply` from `@silvery/headless`) — not the whole universe.

Honest caveat: Slate has multiple override hooks beyond `apply` (normalize, insertData, isVoid, isInline, selection behavior). Our comparison simplified that. "Closed op set" is only partly true — Slate's ops are defined by Slate, but plugin extensibility happens at multiple layers above raw op application.

---

## 6. Tradeoffs (sharpened 2026-04-20)

Calling the apply-chain "TEA" is loose. Once state is no longer in the function signature, it is not TEA in the strong sense. It is middleware / chain-of-responsibility / plugin bus with locally stateful handlers returning effect descriptors.

**Gains** vs pure `(state, op) → [state, effects]`:
- Modular composition
- Less global-state plumbing
- Plugin encapsulation
- Easier feature-local extension

**Losses** vs pure reducer:
- Weaker global inspectability (state is split across plugin-owned slices)
- Weaker referential transparency (each plugin's apply has side effects)
- Harder whole-app replay / time-travel (requires fixed init + plugin ordering + determinism + all hidden state derivable from op stream)
- Harder reasoning about cross-plugin atomicity/invariants

That last one matters for km. Board/tree/selection/editor invariants span plugins. Hidden slice state can make atomic cross-domain updates harder than in a single pure reducer. The atomic-ops contract (`km-tui.atomic-tree-ops`, closed) exists precisely to compensate — Tree.apply MUST return both tree and selection updates in one op; otherwise the plateau is reintroduced.

Better one-liner than "it's TEA":
> The shipped substrate is not pure TEA. It's a middleware/plugin contract: handlers may consume an op, mutate their owned slice via closure/set, and emit effect descriptors. You gain modularity and encapsulation, but lose some of the explicitness and replay/debug properties of a single pure reducer.

---

## 7. Full input pipeline (5 stages, all event variations)

Source: `vendor/silvery/docs/guide/input-architecture.md` + `@silvery/create/src/runtime/*`.

### Stage 1 — Terminal Provider (`@silvery/ag-term`)

`createTermProvider()` wraps stdin. `onChunk()` uses `splitRawInput()` to separate into individual sequences (key repeat `jjj` → 3 sequences; CSI mouse across chunks → buffered).

Emits typed `ProviderEvent`:
- `{ type: "key", data: { input, key } }` — keyboard
- `{ type: "mouse", data: ParsedMouse }` — SGR mouse
- `{ type: "paste", data: { text } }` — bracketed paste, detected pre-split, whole
- `{ type: "resize", data: { cols, rows } }`
- `{ type: "focus", data: { focused } }` — terminal focus in/out

### Stage 2 — Parser (`@silvery/ag/keys`)

`parseKey(raw)` → `[input, key]`. Two-layer output:
- `input` — normalized for keybindings (shifted punctuation decomposed: `#` → `input:"3"`, `shift:true`)
- `key.text` — actual typed character (for insertion always use `key.text ?? input`)

Kitty protocol extracts: modifier bitmask (ctrl/shift/alt/super/hyper/capsLock/numLock), `eventType: "press" | "repeat" | "release"`, shifted codepoint, text codepoints. Default flags: DISAMBIGUATE + REPORT_EVENTS + REPORT_ALL_KEYS (= 11).

### Stage 3 — Event Loop (`processEventBatch` → `runEventBatch`)

Batching: all queued events processed before one render. Burst of 3 `j` presses = 3 handlers → 1 render.

Bridge first, filter second:
```
for event in batch:
  bridge to runtimeInputListeners        # useModifierKeys sees EVERYTHING
  filter: skip if key.eventType === "release"
  filter: skip if isModifierOnlyEvent(input, key)
  → Stage 4 (focus dispatch)
```

Lifecycle intercepts (`lifecycle-effects.ts`): Ctrl+C → `{type:"exit"}`; Ctrl+Z → `{type:"suspend"}`.

Effect drain after apply chain returns: runner handles `render`, `render-barrier`, `exit`, `suspend`, nested `dispatch` (re-entry via queue), plus plugin-registered runners.

**Substrate shipped** at `vendor/silvery/packages/create/src/runtime/`:
- `base-app.ts` — `createBaseApp()`, reentry guard, effect drain
- `event-loop.ts` — `runEventBatch(app, events, hooks, options)`
- `with-input-chain.ts`, `with-focus-chain.ts`, `with-paste-chain.ts`, `with-terminal-chain.ts` — plugin implementations
- `lifecycle-effects.ts` — Ctrl+C / Ctrl+Z / exit / suspend as typed Effect data

**Production cutover**: `create-app.tsx` still uses legacy `processEventBatch + runtimeInputListeners + handleFocusNavigation`. Migration to `runEventBatch` on a piped chain is staged in `km-silvery.tea-useinput`.

### Stage 4 — Focus Dispatch (`dispatchKeyEvent`)

DOM-style phases for press/repeat:
1. Capture (root → target) — `onKeyDownCapture` on each ancestor
2. Target — focused node's `onKeyDown`
3. Bubble (target → root) — `onKeyDown` on ancestors

`event.stopPropagation()` halts; `event.preventDefault()` suppresses default focus nav.

Release events: Stage 3 filters out. If they ever reached Stage 4, DOM-style `onKeyUp` exists but no capture phase (deliberate simplification). In practice release is consumed via RuntimeContext bridge by `useModifierKeys` / `useInput({onRelease})`.

Default focus navigation (runs if nothing consumed):
- Tab → focusNext · Shift+Tab → focusPrev
- Enter on focusScope → enter · Escape → exit/blur

### Stage 5 — Hooks & handlers

```
Event
  ├─ withDomEvents    → component onKeyDown / onKeyUp (Stage 4 result)
  │     └ stopPropagation? done
  ├─ withFocus chain  → focused-element dispatchKey
  ├─ withCommands     → key → commandId → action
  └─ withInput (fallback) → useInput handlers, registration order, "exit" short-circuits
```

| Hook | Sees releases? | Sees modifier-only? |
|---|---|---|
| `useInput()` | only via `onRelease` opt | no (filtered) |
| `useModifierKeys()` | yes (bridge) | yes |
| `useInputLayer()` | no | no |
| `usePaste()` / `usePasteCallback()` | — | — |
| `useExit()` | — | — |

### Effective precedence — by event type (canonical)

Effective precedence is **not derivable from pipe order alone**, because plugins have different delegation styles:

- **observe** (bridge to listeners, then `prev(op)`) — e.g., terminal modifier tracking, tracing
- **handle-instead-of-prev** (consume, never delegate) — e.g., focused-element dispatch when it claims an event
- **fallback-after-prev** (delegate first, handle only if inner returned `false`) — e.g., global commands, useInput fallback
- **middleware wrapper** (delegate, augment effects) — e.g., undo record + replay, storage persist

"Later in `pipe()` = outer" is therefore a structural rule (wrapper position), not an effective-order rule (who actually handles each op). To reason about behavior, use the lane model below — it holds regardless of wrapper-position permutations that leave delegation styles unchanged.

**Event-type order of effective handling** (the canonical reference):

- **Key press/repeat**: 1 provider → 2 parse → 3 bridge + filter → 4 capture/target/bubble → 5 `withDomEvents` (stopPropagation? stop) → focus chain (focused element can consume) → `withCommands` (unhandled keys → command id) → `withInput` fallback (useInput handlers) → default focus nav (Tab/Shift-Tab/Enter/Escape) → render
- **Key release**: 1 → 2 (`eventType=release`) → 3 bridge to `runtimeInputListeners` only; filtered out before Stage 4; seen by `useModifierKeys` and `useInput({onRelease})` only
- **Modifier-only** (Cmd/Shift/Alt/Ctrl alone): 1 → 2 → 3 bridge only; `isModifierOnlyEvent` filters before Stage 4
- **Paste (bracketed)**: 1 provider emits `{type:"paste", text}` whole → `withPaste` tries focused `onPaste` via `routeToFocused` → else global paste handlers
- **Mouse**: 1 provider parses SGR → ParsedMouse → `withDomEvents` dispatches to nodes at hit-test position (capture/target/bubble mirrors keys); DragFeature tracks drag
- **Resize**: 1 provider → `withTerminalChain` `term:resize` → re-layout + render
- **Focus in/out**: 1 provider → `withTerminalChain` `term:focus` → clears sticky modifier state on blur; surfaces via `useModifierKeys` / `onFocusChange`
- **Lifecycle (Ctrl+C / Ctrl+Z)**: Stage 3 intercepts via `lifecycle-effects.ts` → emits `{type:"exit"}` / `{type:"suspend"}` effect → runner's `onExit` / `onSuspend`

**Lane model (complements "later = outer")**. For adding plugin N+1 safely, think in lanes, not wrapper positions:

1. **observe everything** — terminal/modifiers/tracing/lifecycle (bridge, then `prev`)
2. **route to focused/local handlers** — dom events, focus, paste (handle-if-focused, else `prev`)
3. **global commands** — named command dispatch (fallback after `prev`)
4. **input fallback** — registered `useInput` handlers (last-resort)
5. **default focus navigation** — Tab/Shift-Tab/Enter/Escape on focus scopes (after all above returned `false`)
6. **middleware wrappers** — undo record, storage persist (outer, augment effects)

### Structural composition order (wrapper positions)

```ts
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),   // Lane 1 — observer: modifiers, resize, focus
  withDomEvents(),         // Lane 2 — onKeyDown/Up, mouse capture/target/bubble
  withFocus(),             // Lane 2 — focused-element dispatchKey
  withPaste(),             // Lane 2 — focused-then-global paste routing
  withCommands(opts),      // Lane 3 — unhandled keys → named commands
  // Lane 4 — (fallback) useInput handlers, registration order, "exit" short-circuits
  // Lane 5 — default focus nav runs last, only if nothing above consumed
)
```

**Read this pipe bottom-up for dispatch order**: `withCommands` is the outermost handler plugin (added last among handler plugins), so it sees ops before `withPaste`, etc. But effective handling follows the lanes above — an observer plugin like `withTerminal` always runs its bridge regardless of how outer the handler plugins are. Wrapper position determines who gets `op` first; delegation style (observe / handle-instead / fallback / middleware) determines who actually acts on it.

---

## 8. Operational status (as of 2026-04-20)

**Shipped (silvery):**
- `@silvery/create` v0.18.x — `pipe()`, `createApp()`, `withApp()`, `withCommands`, `withKeybindings`, `withReact`, `withTerminal`, `withFocus`, `withDomEvents`, `withLinks`, `withDiagnostics`, `withRender`
- `@silvery/create/runtime/` substrate (90 contract tests) — base-app, event-loop, with-{input,focus,paste,terminal}-chain, lifecycle-effects
- `@silvery/commands` v0.18.x — `createCommandRegistry`, `withCommands`, `withKeybindings`
- `@silvery/signals` v0.18.x — thin alien-signals wrapper
- `@silvery/headless` v0.18.x — readline, select-list, copy-mode, find, pointer, machine, selection

**Staged (silvery):**
- `km-silvery.tea-useinput` — cutover `create-app.tsx` from `processEventBatch` → `runEventBatch` on piped chain
- `km-silvery.tea.aichat-polish` — flagship example using shipped substrate

**Gates (@km/tui/tea)** — two-part status, read carefully:

- **G1 — silvery TEA framework**:
  - **Substrate library**: **shipped ✓** — `@silvery/create/runtime/` modules (`base-app`, `event-loop`, `with-{input,focus,paste,terminal}-chain`, `lifecycle-effects`) compile, export, and pass 90 contract tests.
  - **Production cutover**: **pending** — `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` (2,978 LOC) still uses legacy `processEventBatch + runtimeInputListeners + handleFocusNavigation`. Migration to `runEventBatch` on a piped chain is tracked by `km-silvery.tea-useinput`.
  - **What "ready" means for @km/tui/tea Phase 1**: both halves of G1 should land before Phase 1 touches km, because km's real-world input surface (React reconciler integration, modifier tracking, bracketed paste, focus in/out, error boundaries) only gets exercised once `create-app.tsx` is cut over. Until then, the substrate is **bench-tested, not flight-proven** for km's scale.
- **G2 — unified-selection**: ✓ closed (Phase 0 on `feat/selection-plateau`)
- **G3 — atomic-tree-ops**: ✓ closed

**Pending beads:**
- `km-silvery.tea-useinput` (silvery-side) — production cutover of `create-app.tsx`; this is the specific unblocker for @km/tui/tea Phase 1
- `km-silvery.tea.migration` (bridge) — km adopts @silvery/commands/signals/headless
- `km-tui.tea` (7-phase domain) — withDialogs, withBoard, withEditor, withSelection, withTree, withUndo, withStorage

**Reconciliation of "NOT READY" vs "shipped ✓"**: both are true under the split above. The G1 substrate library shipped; the G1 production cutover did not. Earlier bead text collapsed these into a single blanket "NOT READY TO START", which read as contradicting this bead's "G1 shipped ✓" framing. The correct framing: **substrate shipped, production cutover pending, Phase 1 blocks on the cutover specifically, not on the substrate library existing**.

---

## Acceptance (of THIS bead)

This bead is a REFERENCE artifact, not a unit of work. "Done" means:
- Captures the four discussion arcs (from, to, why apply shape, input flow)
- Cites the tradeoff critique honestly
- Lists operational status with shipped-vs-pending accurately as of capture date
- Links cleanly to @km/silvery/tea/migration, @km/tui/tea, @km/silvery/tea-useinput

Future sessions on the migration should read this first before re-deriving the mental model.

## References

- Shipped substrate tests: `vendor/silvery/packages/create/tests/runtime/`
- Prototype: `vendor/internal/silvery/design/v15-tea/plugin-system-v1r.ts`
- Input architecture: `vendor/silvery/docs/guide/input-architecture.md`
- Refactoring lessons: `docs/lessons/refactoring.md` (case studies 1, 7, 8)
- @km/tui/tea bead: 7-phase plan with risk classifications
- @km/silvery/tea/migration bead: the bridge work
- @km/silvery/tea epic: silvery-side phases 2-4

---

## Reconciliation notes (2026-04-21)

A dual-pro review (GPT-5.4 Pro + Kimi K2.6, session `8b5b9e1c`) against tea-discuss + @km/tui/tea + @km/silvery/tea surfaced six internal contradictions. Each was a descriptive-not-architectural conflict — the architecture wasn't wrong, the docs described it inconsistently. This section records what was clarified and why, so future sessions don't re-derive the same ambiguities.

1. **"Outermost" semantics (§2 target-architecture pipe example).** Earlier text put `withStorage()` first in the `pipe()` and labeled it "outermost", which contradicts the "later in `pipe()` = outer in dispatch" rule stated later in the same bead. **Fix**: adopt "later = outer" as canonical (matches silvery's shipped `compose()` / `runtime/base-app.ts` comments and v1r prototype); rewrite the §2 example so `withStorage()` is the **last** argument and therefore genuinely outermost. Also added an explicit "Pipe convention" callout so the rule isn't just an incidental sentence near the bottom.

2. **Pipe order ≠ effective precedence (§7).** "Later = outer" describes wrapper position, not effective order — plugins with different delegation styles (observe / handle-instead / fallback / middleware) produce different effective orders. **Fix**: kept the wrapper-position rule, but expanded the §7 "Per-event-type quick reference" into a canonical "Effective precedence — by event type" section, and added a lane model (observer / route-to-focused / global commands / input fallback / default focus nav / middleware wrappers). Reason by lane + delegation style first; reason by pipe position only to check wrapper placement.

3. **`app.commands.*` vs `app.cmd.*`.** Both forms appeared. **Fix**: standardize on `app.cmd.<id>()` (matches the shipped `vendor/silvery/packages/commands/src/with-commands.ts` proxy). Existing references to `app.commands.*` in design-era docs are annotated as "same concept, historical spelling". New code, tests, and bead descriptions should use `app.cmd.<id>()`.

4. **Universal signature apparent contradiction (`(state, op) → [state, effects]` vs `apply(op) → false | Effect[]`).** `km-all.tea-machines` (closed) called the first form "universal, no exceptions"; this bead and the shipped substrate use the second. **Fix**: describe two explicit layers — inner domain reducers (classic TEA) and outer plugin bus (middleware chain). Both signatures are canonical, at different layers. tea-machines scope was always inner reducers; the shipped `apply(op) → false | Effect[]` is the outer contract. §3 was rewritten to open with this two-layer framing.

5. **"Ready" status contradiction.** `km-tui.tea` said "NOT READY TO START"; this bead said "G1 substrate shipped ✓". **Fix**: split G1 into two halves — substrate library (shipped) and production cutover (pending, tracked by `km-silvery.tea-useinput`). Phase 1 blocks on the cutover specifically, not on the substrate library existing. Both preambles now cite the specific pending work instead of a blanket "NOT READY" that read as contradicting the substrate-shipped claim.

6. **`withEditor` scope drift (Phase 3).** Some text implied `withEditor` is a PlainText-only inline/title/body-as-text cutover; other text implied a rich-body / Slate-based universal editor. **Fix**: scope Phase 3 explicitly as **PlainText cutover only** (inline fields, title edit, body-as-plain-text). The rich-body / Slate-based editor is a post-plateau future concern, tracked under `docs/future/universal-editor.md` and any downstream `withRichEditor` bead. Phase 3's `/complete` grep criteria cover PlainText migration only.

**What did NOT change**: the architecture itself — `apply(op) → false | Effect[]` is still the shipped outer contract; later-in-pipe is still outer; phases 1–7 are unchanged; bridge audit in the NOTES section is unchanged. The reconciliation is descriptive only. If any of these fixes turns out to contradict an actual execution bead decision, the execution bead wins (per the rule below) and this section should be updated.

Source: `/tmp/llm-8b5b9e1c-architectural-review-of-kms-3zlv.txt` (dual-pro review, 2026-04-21).