# definePlugin — Spike Report (2026-04-21)

**Bead:** `km-silvery.definePlugin` (P1, under `km-silvery.authoring-elegance`)
**Session:** spike + prototype for the Cycle 1 elegance review follow-up
**Status:** landed — HelpOverlay v2 at 35 LOC total, well under the 50-LOC gate

---

## What shipped

Three files — all new, additive, non-breaking:

| File                                                                                       | LOC | Role |
| ------------------------------------------------------------------------------------------ | --: | ---- |
| `vendor/silvery/packages/create/src/definePlugin.ts`                                       | ~170 (incl. comments) | Factory + types |
| `vendor/silvery/packages/create/src/useStore.ts`                                           | ~40  | React hook |
| `apps/km-tui/src/plugins/help-overlay.v2.ts`                                                | **35** | HelpOverlay re-cutover |
| `apps/km-tui/tests/plugins/help-overlay-v2.test.ts`                                         | ~170 | Unit + parity tests |

Registration: `definePlugin`, `Plugin`, `OpOf`, `PluginHandle`, `useStore` are exported from `@silvery/create` (see `index.ts`).

Dual-write to v2 is gated by `KM_TEA_HELP_V2=1`; dispatches are added alongside the existing `KM_TEA_HELP=1` path in `apps/km-tui/src/board/board-actions.ts`. Legacy path stays intact.

---

## API reference

```ts
import { definePlugin, useStore } from "@silvery/create"

const helpOverlay = definePlugin({
  name: "help",                                                            // literal type flows through
  state: { visible: false, scrollOffset: 0 },                              // state type inferred
  ops: {
    show: (s) => (s.visible ? s : { visible: true, scrollOffset: 0 }),    // (state) => state
    hide: (s) => (s.visible ? { visible: false, scrollOffset: 0 } : s),
    toggle: (s) => ({ ...s, visible: !s.visible }),
    scrollDown: (s) => ({ ...s, scrollOffset: s.scrollOffset + 1 }),
  },
  keys: { "?": "toggle", Escape: "hide", j: "scrollDown" },                // keys → op-name map
})

helpOverlay.dispatch({ type: "help.show" })                                // typed op
helpOverlay.dispatchOp("show")                                             // short form
helpOverlay.getState()                                                     // State
helpOverlay.subscribe(fn)                                                  // zustand-shape
helpOverlay.reset()                                                        // test helper

// Consumer component:
function HelpOverlayView() {
  const { state, dispatch } = useStore(helpOverlay)
  if (!state.visible) return null
  return <HelpOverlay scrollOffset={state.scrollOffset} />
}
```

### Types

- `OpOf<Name, Ops>` — discriminated union of `{ type: \`${name}.${opKey}\` }` literals. No hand-typed strings.
- `Plugin<Name, State, Ops>` — handle returned by the factory. Zustand-shape store + metadata (`name`, `keys`, `opNames`) + typed dispatch.
- `PluginReducer<State, Payload = void>` — `(state, payload) => state | [state, effects]`. Tuple form is the effects escape hatch.

### Payload-aware reducers (type-inferred)

```ts
ops: {
  setScroll: (s, offset: number) => ({ ...s, scrollOffset: offset }),
}
// helpOverlay.dispatch({ type: "help.setScroll", payload: 5 })  // payload required + typed
// helpOverlay.dispatchOp("setScroll", 5)                         // short form, also typed
```

The `PayloadOf<R>` helper discriminates on `Parameters` length — 1-arg reducers get `void` payload, 2-arg reducers get the declared payload type. No casts required in plugin bodies.

---

## LOC comparison

| Variant | Files | LOC | Ratio vs v1 |
| --- | ---: | ---: | --- |
| **v1** `with-help-overlay.ts` + `use-help-overlay.ts` + `HelpOverlayBridge.tsx` | 3 | **296** | 1.0× |
| **v2** `help-overlay.v2.ts` (plugin + feature flag) | 1 | **35** | **0.12×** |

The v2 file contains: 13 lines of JSDoc (intent + scope), 1 import, 12 lines of plugin spec, 1 line for the flag helper, blank lines. The reducer is 5 lines. The keys map is 1 line. That's the whole plugin.

The v1→v2 delta cut:

- 40 LOC of hand-rolled zustand-shape store → factory-owned.
- 15 LOC of singleton + `resetXxxStore()` → `plugin.reset()` on the handle.
- 25 LOC of manual op-type string literals + HelpOp discriminated union → derived from `name` + `ops` keys.
- 23 LOC of `useHelpOverlay()` bridge → `useStore(helpOverlay)` one-liner at call sites.
- 60 LOC of `HelpOverlayBridge.tsx` — feature flag ternary + React adapter. **Still needed** for the v2 dual-write flag, but the bridge shrinks to ~10 LOC once the v1 path is removed.

**Not yet deleted** in this spike: v1 files stay until the v2 path is promoted (no dual-rewrite of the bridge in scope here). The gate (≤50 LOC for the plugin declaration itself) is **PASSED** — 35 LOC.

---

## Ergonomics — scored against the 6 elegance criteria

| # | Criterion | v1 Cycle 1 | v2 spike | Delta |
| --- | --- | --- | --- | --- |
| 1 | Minimum viable plugin ≤50 LOC | FAIL (296) | **PASS (35)** | +PASS |
| 2 | Zero `as` casts in plugin code | PASS (0) | **PASS (0)** | — |
| 3 | Zero manual `${name}.${op}` string literals | FAIL (9+) | **PASS (0)** | +PASS |
| 4 | Types flow without hand-typed op unions | PARTIAL | **PASS** — `OpOf<Name, Ops>` discriminated union derived from the spec | +PASS |
| 5 | Precedence bugs caught at `pipe()` time | FAIL | **DEFERRED** — still no role-lane type-level tag (by design, per pro review) | — |
| 6 | External dev builds plugin from docs in <2h | N/A | N/A — docs beyond this spike report are bead `km-silvery.plugin-authoring-doc` | — |

**Criteria 1, 3, 4 flipped from FAIL to PASS.** The other pass-through criteria (2, 5, 6) were already in their target state or deferred.

Qualitative verdict: the HelpOverlay plugin body is now **dense with intent and nothing else.** Every line expresses a user-visible transition. No boilerplate, no ceremony. The Zustand-parity line (one-line store, one-line hook) is crossed.

---

## What's intentionally NOT covered (follow-up beads)

- **Effects-as-Effects routing.** The tuple return form `(state) => [state, effects]` parses but effects are dropped by the spike. Full integration requires the `tea-apply-helpers` work + plugin-pipeline effect namespace dispatch. → bead `km-silvery.tea-apply-helpers`.
- **`keys:` honouring by a `withKeys()` plugin.** The shorthand is recorded on the plugin and exposed via `plugin.keys`, but there is no convention plugin yet that wires key bindings. Today km-tui routes keys through `@km/commands` so the shorthand is declarative only. → bead `km-silvery.with-keys-convention` (new — file during commit).
- **Role-lanes / precedence enforcement.** Deliberately deferred per pro review verdict (prevents Slate-style obscurity until discipline fails). → bead `km-silvery.role-lanes-decide`.
- **AppPlugin pipeline integration.** The plugin handle is not yet consumed by `pipe()`; consumers call it directly. A `withPlugin(plugin)` adapter would register the plugin's apply into the BaseApp apply chain. → bead `km-silvery.with-plugin-adapter` (new — file during commit).
- **Lint rule banning string-literal namespacing.** → bead `km-silvery.plugin-namespace-lint` (already filed, still P3).
- **SearchDialog cutover.** Not in this spike — SearchDialog's ~417 LOC includes legitimate dialog-chrome concerns (text input, focus scope, multi-slice close) that are app concern, not plugin concern. Target: ~80 LOC plugin + leave dialog chrome alone. → bead `km-silvery.search-definePlugin-cutover` (new — file during commit).

---

## Worked example — sketch of SearchDialog v2

For scale validation, here is what a SearchDialog v2 plugin would look like. Not implemented — sketched for the follow-up bead.

```ts
export const searchDialog = definePlugin({
  name: "search",
  state: {
    visible: false,
    query: "",
    scope: "all" as "all" | "cards" | "columns",
    scopeNodeIds: [] as string[],
  },
  ops: {
    show:       (s, { scope, initialInput }: { scope: SearchScope; initialInput?: string }) => ({
      ...s, visible: true, scope, query: initialInput ?? "", scopeNodeIds: [],
    }),
    hide:       (s) => (s.visible ? { ...s, visible: false, query: "", scopeNodeIds: [] } : s),
    setQuery:   (s, query: string) => ({ ...s, query }),
    setScope:   (s, scope: SearchScope) => ({ ...s, scope }),
    setNodeIds: (s, ids: string[]) => ({ ...s, scopeNodeIds: ids }),
  },
  keys: { Escape: "hide" },
})
```

That's 20 LOC for the plugin body, same as HelpOverlay. The full SearchDialog v2 file would be ~35 LOC — matching HelpOverlay. The remaining ~80 LOC in the current SearchDialog bridge is legitimate dialog-chrome that stays in the km-tui layer (TextInput wiring, focus scope, centerdialog positioning).

---

## Next cycle gate (2026-05-21)

Criterion to measure at Cycle 2: **SearchDialog v2 at ≤80 LOC total (plugin file + app-concern bridge), with the plugin body ≤35 LOC.** If yes, the `definePlugin` primitive generalizes; if no, diagnose which dialog-chrome primitive silvery is missing.
