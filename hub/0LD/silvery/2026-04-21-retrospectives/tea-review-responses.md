# TEA Architecture — Responses to Dual-Pro Review (2026-04-21)

Source critique: `/tmp/llm-8b5b9e1c-architectural-review-of-kms-3zlv.txt` (GPT-5.4 Pro + Kimi K2.6, $3.83, 77K tokens).

This document answers the 9 substantive architectural concerns from the dual-pro review. The 6 pure doc contradictions are handled separately by the doc-hygiene agent (2026-04-21).

---

## 1. `[]` vs `false` footgun

**Concern**: `return []` silently swallows an op when the author meant `return false` (pass through).

**Response**: Introduce helper functions at the apply-chain boundary. Plugin authors use them instead of raw literals:

```ts
// New helpers in @silvery/create
export const passThrough = false as const
export const consumed = (effects: Effect[] = []): Effect[] => effects

// Before — footgun:
apply(op) {
  if (op.type === "indent") return []          // easy to mistake for pass-through
  return false
}

// After — self-documenting:
apply(op) {
  if (op.type === "indent") return consumed()  // explicit intent
  return passThrough
}
```

Keep the underlying `false | Effect[]` shape for compat — helpers compile to identical values. Author-ergonomics win without breaking the 90 contract tests.

**Lint rule (Phase 2)**: flag bare `return []` in any function typed `apply(op) => ApplyResult`. The return type is already exported; the rule is mechanical.

**Action**: file sub-bead under km-silvery.tea — `km-silvery.tea-apply-helpers`.

---

## 2. Multi-domain atomic updates

**Concern**: "Delete current node while editing text" touches tree + selection + editor + undo + storage. Middleware chain can't run one pure transition across these; it either leaks knowledge across plugins or invents composite ops.

**Response**: **Composite ops are the correct primitive, not a hack.** Design them as first-class:

```ts
type Op =
  | { type: "tree.insert_node", ... }
  | { type: "selection.set", ... }
  | { type: "undo.record", ... }
  | { type: "composite", ops: Op[] }   // atomic transaction
```

A plugin (`withAtomicOps` or just the outermost-inner, usually `withUndo`) unpacks composite ops and dispatches the sub-ops in a transaction scope. If any sub-op fails, roll back.

**Invariant**: sub-ops in a composite CANNOT dispatch further ops. They produce effects, nothing else. Transaction bookkeeping lives in one place.

**Why this isn't a hack**: classic TEA also handles composite actions — it just does so by modeling them in the state shape. We model them in the op shape instead. Different encoding, same expressive power.

**Action**: file sub-bead — `km-silvery.tea-composite-ops`.

---

## 3. Undo visibility (K2.6's strongest critique)

**Concern**: `withUndo` wraps `withTree` in the chain. When tree handles an op, it returns `Effect[]` — undo sees the op + effects but NOT the state delta. Can't compute inverse without re-implementing tree logic.

**Response**: **State-delta convention as a first-class effect type.** Every mutating plugin MUST emit `{ type: "state_delta", slice, inverse }` for every op it consumes:

```ts
// Inside withTree:
apply(op) {
  if (op.type === "tree.insert_node") {
    const inverse = { type: "tree.remove_node", id: op.id }
    store.insert(op.node)
    return [{ type: "state_delta", slice: "tree", inverse }]
  }
  return false
}

// Inside withUndo (outer):
apply(op) {
  const effects = prev(op)
  if (effects === false) return false
  for (const fx of effects) {
    if (fx.type === "state_delta") undoStack.push(fx.inverse)
  }
  return effects
}
```

**Enforcement**: a contract test validates that every plugin which modifies external state emits a `state_delta` effect. The test introspects the plugin registry (via a `.mutates = true` flag) and runs a transcript of ops against each, asserting delta emission.

**Answers Pro's "cross-plugin invariants not in type signature"**: they're in CONVENTION + TEST, not type. That's a real weakness vs pure TEA but acceptable for the middleware model — provided the test exists.

**Action**: file sub-bead — `km-silvery.tea-state-delta-convention`.

---

## 4. Storage blind watcher

**Concern**: `withStorage` outermost can only see effects, not state. Forgetting `persist` effect = silent data loss.

**Response**: Same mechanism as undo — piggyback on `state_delta`. `withStorage` watches for `state_delta` with `slice: "repo" | "tree" | "config"` and persists based on the slice. No separate `persist` effect needed; the convention is one effect type for all state-change observers.

Trade-off: changes the dispatch shape slightly (fewer effect types). Upside: one contract covers undo AND storage. Violating the contract is caught once, protects both.

---

## 5. Plugin role lanes (Pro's recommendation)

**Concern**: plugin contracts are all identical (`apply(op) => ApplyResult`) but roles vary — observers, targeted handlers, global handlers, fallbacks, middleware. Adding plugin N+1 can break N.

**Response**: Codify 5 lanes as documented policy + optional type tag:

```ts
type PluginRole =
  | "observer"    // always passes through after observing; never consumes
  | "targeted"    // routes to focused/local (dom, focus, paste); may consume
  | "global"      // commands, modifiers; may consume
  | "fallback"    // last resort (useInput); may consume
  | "middleware"  // wraps all above (undo, storage, tracing); observes + amplifies

interface AppPlugin {
  role: PluginRole
  apply(op: Op, prev: Apply): ApplyResult
}
```

Pipe order enforced by type-level constraint (later in role hierarchy = later in pipe). Observers MUST NOT consume ops (lint enforceable). Middleware SEEN FIRST (outer), observers run as a lane before the handlers.

**Effective precedence** (stated as policy):
1. Middleware wrappers (observe ops + effects, transform/record) — outermost
2. Observers (terminal, modifiers, tracing) — always pass through
3. Targeted handlers (dom event routing, focus, paste)
4. Global handlers (commands)
5. Fallback handlers (useInput)
6. Default behavior (focus nav)

This is Pro's "document effective precedence by event type" recommendation, crystallized into a role system.

**Action**: file sub-bead — `km-silvery.tea-role-lanes`.

---

## 6. `withFocus` consuming Enter before `withCommands`

**Concern**: if withFocus consumes Enter for default focus nav, withCommands never sees it — silently dropping `dialog.confirm` commands.

**Response**: Precedence rule — `withFocus` MUST call `prev(op)` first for semantically-ambiguous keys (Enter, Escape, Tab). Only fall back to default focus nav if `prev` returns `false`:

```ts
// Inside withFocus:
apply(op, prev) {
  if (op.type === "key.enter" || op.type === "key.escape") {
    const handled = prev(op)              // let commands see it first
    if (handled !== false) return handled
    return defaultFocusNav(op)            // fall back
  }
  // ...
}
```

This inverts the naïve "later = outer, sees first" for ambiguous keys. Document it as a CONTRACT, not an accident of implementation.

---

## 7. 226 sel.* call sites

**Concern**: K2.6 — can't migrate 226 sites atomically; 7-phase plan assumes a cliff-jump.

**Response**: Incremental bridge (shim pattern):

```ts
// Old call sites continue to work:
sel.node.set(id)

// sel shim delegates to withSelection plugin:
export const sel = {
  node: {
    set: (id) => app.dispatch({ type: "selection.set_node", id }),
    // ...
  },
  text: {
    edit: (edit) => app.dispatch({ type: "selection.text_edit", edit }),
    // ...
  }
}
```

Phase 4 becomes:
- Ship withSelection plugin (new)
- Wire `sel` shim to delegate
- Migrate call sites incrementally across multiple sessions
- Delete the shim only when grep shows 0 callers

**Not** a 1-session atomic migration. Per docs/lessons/refactoring.md: "Rename first, split later" — and here the shim lets the rename happen without splitting the world.

---

## 8. Substrate bench vs flight

**Concern**: 90 contract tests pass; create-app.tsx cutover unvalidated.

**Response**: **The board-nav spike IS this validation.** Running now in a worktree (agent aff2ed2d). If the spike wraps km's existing pure nav reducer and runs on the real runtime in < 2 days, we have flight evidence. If it fights the framework, we abort before committing to Phase 1.

Answer to "how do we know when it's flight-proven": the spike's acceptance criteria. Specifically:
- `cursor_down` dispatch → rendered output updates
- Dialog-precedence (Phase 2) → Enter routes to command not focus nav
- Trace log readable by a human post-run

No further validation needed before Phase 1 commits.

---

## 9. `withEditor` scope drift (PlainText vs Slate)

**Concern**: docs imply both "PlainText only" and "eventual Slate rich editing".

**Response**: Explicit scope declaration. Phase 3 `withEditor`:
- IS: PlainText for inline/title/body-as-text editing
- IS NOT: rich/Slate editing, embedded lists, inline mark-up

Rich editing is post-plateau future work. When it arrives, it's EITHER a replacement for `withEditor` (v2) OR a separate `withRichEditor` plugin that composes — architectural decision deferred until Phase 3 lands and we know what the integration point feels like.

Document this in km-tui.tea Phase 3 preamble. Don't promise capabilities the phase won't deliver.

---

## Composite plan — sub-beads to file under km-silvery.tea

After dual-pro review, these new sub-beads emerge:

1. `km-silvery.tea-apply-helpers` (P2) — `passThrough`/`consumed()` helpers + lint rule
2. `km-silvery.tea-composite-ops` (P1) — composite op primitive + transaction bookkeeping
3. `km-silvery.tea-state-delta-convention` (P1) — `state_delta` effect + contract test
4. `km-silvery.tea-role-lanes` (P2) — plugin role tag + lane precedence documentation
5. `km-silvery.tea-focus-precedence` (P2) — withFocus contract for ambiguous keys
6. `km-tui.tea-sel-shim` (P1) — sel.* compat shim + incremental migration plan

Items 2 + 3 + 6 are blockers for Phase 6 (undo) per K2.6's critique. File them first.

---

## Verdict

The dual-pro critique is sharp but each concern has a concrete resolution that fits within the existing architecture. No architectural pivot required. What's required is **discipline** (conventions + contract tests) to cover the gaps where the type system can't help.

Shape confidence trajectory:
- Before review: uncertain (docs contradict, multi-domain flows unclear)
- After doc-hygiene + responses (this doc): clarified
- After board-nav spike: empirical
- After Phase 1 (withDialogs): proven

Spike result is the next confidence data point. Report landing in `hub/silvery/` when the spike finishes.
