# Lesson: Understand the Architecture Before Changing It

**Keywords**: architecture, input, command system, exploration, planning

## What Happened

Task: migrate Board.tsx from `useInput` to `useInputLayer` so InlineEditField's text capture works without key conflicts.

A previous session (commit `2776b88f`) had already migrated dialogs (SearchDialog, NewItemDialog, ItemPicker) to `useInputLayer`. Board was left on `useInput` with a manual guard (`if (ui.inlineEditNodeId) return false`) to suppress key conflicts during inline editing.

The planning session saw dialogs using `useInputLayer` and pattern-matched: "DetailPane should get one too for h/j/k/Esc." It designed the plan mechanically — swap `useInput` for `useInputLayer`, give each component its own layer — without exploring the command system.

During review, the user asked: "I thought input handling happened in a command/keybinding/mode/context system centrally, not in the component?" That single question revealed the entire plan was architecturally wrong.

## Why It Happened

**The planning session copied the dialog pattern without understanding it.**

The dialogs use `useInputLayer` because they have text input — raw character capture that the command system can't represent. That's the correct use of the primitive. But the planner saw "dialogs use `useInputLayer` for their keys" and generalized to "components should use `useInputLayer` for their keys." The distinction between text input (raw characters) and discrete commands (h/j/k) was never examined.

Meanwhile, the command system already had everything needed:
- `isInDetailPane` in `KeybindingContext` — the context flag existed
- `when` predicates on keybindings — conditional resolution existed
- `CLOSE_DETAIL_PANE` action type — the action existed (now removed; Escape falls through to `close_or_quit`)
- `handleCloseOrQuit` — already handled detail pane for Escape

A 5-minute exploration of `@km/commands` would have revealed all of this. The planning session never looked there because it treated the task as a mechanical migration within `apps/km-tui/src/views/`, not as a change to the input architecture.

## The Meta-Lesson

**Before changing how a subsystem works, understand why it works that way.**

1. **Explore adjacent systems.** The task touched input handling, but the planner only read view components. Reading the command system (`packages/km-commands/`) would have shown the intended architecture immediately.

2. **Don't pattern-match — understand the abstraction.** Dialogs use `useInputLayer` for text input. DetailPane needs discrete command routing. These are different problems requiring different solutions. Pattern-matching "component handles keys → useInputLayer" skipped the critical distinction.

3. **Question the plan.** "Add `useInputLayer` to DetailPane" should have triggered: "Why would a rendering component handle input? How does the rest of the app handle discrete commands?" Instead it was executed mechanically.

4. **Guards are a smell.** The `inlineEditNodeId` guard in board-input.ts was a workaround for `useInput`/`useInputLayer` not participating in the same consumption stack. The planning session treated the guard as "something to clean up" rather than asking "why does this conflict exist, and what's the right fix?"

## Root Cause Fix

The architecture wasn't documented where agents would see it. Added:
- `.claude/skills/tui/design.md` — Input Architecture section with the rule
- `vendor/silvery/CLAUDE.md` — Architecture Note clarifying `useInputLayer` purpose
- This document

The deeper fix: **if an architectural invariant isn't written where agents read it (CLAUDE.md, skills), the invariant doesn't exist for agents.** Document design decisions in the files that get loaded into context, not just in code comments that may never be read.

## React hooks never call `app.dispatch()` (TEA world)

**Keywords**: TEA, plugin, dispatch, reentrant, useInput, keybinding

### Why

Silvery's apply-chain runtime (`@silvery/create/runtime/base-app.ts`) uses a
single-flight `dispatching` flag. While a dispatch is in progress, any nested
`app.dispatch(op)` call throws:

```
Error: Reentrant dispatch: <op.type>
```

The flag exists so the effect drain queue owns re-entry — effects of type
`{ type: "dispatch", op }` are drained after the current dispatch completes,
guaranteeing ordered, observable state transitions. Bypassing the drain
queue (by calling `dispatch` directly from a handler that runs inside the
dispatch lifecycle) defeats this.

### Where the hazard lives

Any React hook that runs **synchronously inside a dispatch cycle** will trip
the guard if it calls `app.dispatch()`:

- `useInput` handlers — run inside `term:key → apply` in the plugin chain
- `useEffect` / `useLayoutEffect` — run after React commits a render that
  was triggered by an effect; if the effect chain is still draining, the
  re-entry throws
- Synchronous subscribers on the store that dispatch back into the app

Event handlers that are scheduled by something OUTSIDE the dispatch chain
(mouse clicks from the OS event loop, timers, debounced callbacks, async
continuations) are safe — by the time they run, the dispatch has already
completed.

### The rule

**Never call `app.dispatch()` (or any silvery TEA dispatcher) from inside a
React hook that runs during render or during event processing.** Route the
key or event through a keybinding **plugin** that returns:

```ts
return [{ type: "dispatch", op: <op> }]
```

as an effect. The runtime's drain queue processes it after the current
dispatch completes.

This is exactly the pattern the 2026-04-21 TEA nav spike validated
(`hub/silvery/experiments/tea-nav-spike/with-commands-spike.ts`). Bead
`km-silvery.tea-useinput-cannot-dispatch` documents the finding.

### Signals / zustand stores are a DIFFERENT layer

`dispatchBoard(action)` on km's `BoardAppStore` is a zustand-flavored store
mutation, NOT a silvery TEA `app.dispatch()`. It does not participate in
the apply-chain dispatch queue and has no re-entrancy guard today.

It is still good hygiene to keep store mutations out of render phases
(prefer `useEffect` or event handlers over inline calls during render), but
the specific "Reentrant dispatch" failure mode does not apply to
`dispatchBoard`. When km-tui migrates to TEA (`km-silvery.tea` epic),
`dispatchBoard` call sites that currently live inside `useEffect` or
`useCallback` event handlers must either:

1. Remain on the zustand store (preferred — signals layer is independent), or
2. Move into a command/plugin that returns a dispatch effect, never call
   `app.dispatch()` inline.

### Guard against regression

`packages/km-infra/scripts/check-test-patterns.sh` includes a grep for
`app.dispatch(` calls inside files that also reference `useInput`,
`useEffect`, or `useLayoutEffect` under `apps/km-tui/src/`. Baseline is 0;
growth fails CI.

### Audit protocol for new code

Before landing any React hook in km-tui that touches input or state
mutation, grep your diff:

```bash
grep -nE 'app\.dispatch\(|runner\.dispatch\(' <files-you-changed>
```

If any hits live inside a `useInput`, `useEffect`, or `useLayoutEffect`,
refactor to the plugin/effect pattern before commit. `dispatchBoard` calls
are fine (zustand layer), but document them with a comment pointing to this
lesson so the next reader doesn't confuse the two layers.
