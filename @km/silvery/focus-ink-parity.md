---
id: "@km/silvery/focus-ink-parity"
aliases:
  - km-silvery.focus-ink-parity
  - km-silvery-focus-ink-parity
created_by: Bjørn Stabell
created_at: 2026-04-09T15:20:56Z
---

# [ ] Focus system — unified, scope-aware, Ink-compatible @km/silvery #epic #P0

blocks:: [[@km/silvery/architectural-plateau]]

# Refactor Plan: @km/silvery/focus-ink-parity

## Verified current state (correcting the bead)

**Two parallel focus systems exist:**

1. **Silvery native FocusManager (keeper)**:
   - `vendor/silvery/packages/ag/src/focus-manager.ts` — tree-based manager with `HookFocusable` support (`registerHookFocusable`, `setHookFocusableActive`, `focusVirtualId`, `setHookFocusEnabled`, `hasHookFocusables`, `hookFocusEnabled`). Unified `TabEntry` list interleaves tree + hook focusables.
   - `vendor/silvery/packages/ag-react/src/hooks/useFocus.ts` — **already shipped** Ink-compatible `useFocus(options)` returning `{isFocused, focus}`. Wired via `FocusManagerContext`.
   - `vendor/silvery/packages/ag-react/src/hooks/useFocusManager.ts` — rich result with `focusNext/focusPrev/blur/activateScope` plus Ink-compat aliases (`enableFocus/disableFocus/focusPrevious`).
   - Wired in `packages/ag-react/src/render.tsx:442,462` and `packages/ag-term/src/renderer.ts:454,502`.

2. **Ink-compat parallel system (to delete)**:
   - `vendor/silvery/packages/ink/src/with-ink-focus.ts` (248 LOC) — owns `InkFocusContext`, `InkFocusProvider`, `withInkFocus()`. Flat `Focusable[]` state + own Tab handling.
   - `vendor/silvery/packages/ink/src/ink-hooks.ts:37-87` — local `useFocus`/`useFocusManager` reading from `InkFocusContext`. Annotated `@deprecated`.
   - `vendor/silvery/packages/ink/src/ink-render.ts:15,332-341,418` — wraps tree in `InkFocusProvider` + installs `InkFocusBridge`. The ONLY planting site.
   - `vendor/silvery/packages/ink/src/with-ink.ts` — composes `withInkCursor() + withInkFocus()`.
   - `vendor/silvery/packages/ink/src/index.ts:17-18` — barrel re-exports
   - `vendor/silvery/packages/ag-term/src/plugins/index.ts:130-134` — re-export
   - `vendor/silvery/packages/ink/package.json:41-43,64` — `./with-ink-focus` subpath

**Bead description correction**: bead says "No tests for useFocus(options)" — **wrong**. Two near-duplicate test files exist:
- `vendor/silvery/tests/features/use-focus.test.tsx` (192 LOC, 7 tests) — canonical
- `vendor/silvery/tests/hooks/useFocus.test.tsx` (192 LOC, 7 tests) — older duplicate, drift
Real gap is tests for the **Ink re-export path**, not the native hook.

**Naming rename `focused` → `isFocused`** is deferred to a separate v1.0 bead — breaking change across all `useFocusable` consumers, not required for Ink parity.

## Target state

One implementation (silvery's FocusManager), two API surfaces sharing one state:
1. `@silvery/ag-react/useFocus` — canonical Ink-compat hook (already shipped)
2. `@silvery/ink/useFocus` — **re-export** of ag-react's hook
3. `ink-render.ts` — no longer plants `InkFocusProvider`; Tab/Shift-Tab/Escape handled by silvery's FocusManager (already wired via `FocusManagerContext` in renderer paths)
4. `with-ink-focus.ts` **deleted**
5. Tests deduped (keep `tests/features/` version); new `focus-reexport.test.tsx` proves hook identity + ink `render()` Tab dispatch through silvery's FocusManager
6. Docs updated (migrate-from-ink, event-handling, compatibility, packages, plugin-architecture, silvery-vs-ink)
7. `focused → isFocused` rename → separate `km-silvery.focusable-rename` bead for v1.0

## Phases (4 sequential, each independently shippable)

### Phase 1: Wire ink-render to silvery FocusManager

ABSORB phase. Reroute ink-render to use the already-wired `FocusManagerContext` for Tab nav, so InkFocusProvider can be removed without breaking Ink compat tests.

**Changes**:
- `ink-render.ts`: delete `InkFocusContext/InkFocusProvider` imports (line 15); delete `createElement(InkFocusProvider, null, ...)` wrapper in `wrapWithInkProviders` (line 418); rewrite `InkFocusBridge` (lines 332-341) to use `useFocusManager` from `@silvery/ag-react`: Tab → `focusNext()`, Shift-Tab → `focusPrev()`, Escape → `blur()`. Gate on `focusCtx.activeElement !== null || focusManager.hasHookFocusables`.
- `ink-hooks.ts`: **keep** local hooks unchanged this phase — deleting them is Phase 2. This phase must let the Ink test suite pass with `InkFocusProvider` removed but old hooks reading default-context no-ops.
- Run full Ink compat suite. **If the suite requires hooks to report real state during Phase 1**, split fails — fuse Phase 1+2 into one atomic change (don't add shims).

**Delete**: `InkFocusProvider` references from `ink-render.ts`, `InkFocusContext` read in `InkFocusBridge`.

**New tests**: none this phase (existing `tests/compat/ink/*` suite is the regression gate). `focus-bridge.test.tsx` can be added here OR in Phase 2.

**/complete grep**:
- `rg 'InkFocusProvider|InkFocusContext' packages/ink/src/ink-render.ts` → 0
- `rg 'from "./with-ink-focus"' packages/ink/src/ink-render.ts` → 0
- `bun vitest run tests/compat/ink` passes

---

### Phase 2: Delete with-ink-focus.ts + replace ink-hooks with re-exports

PURGE + REMOVE. Post-Phase 1, nothing plants `InkFocusProvider`, so deletion causes zero runtime breakage — only tsc errors that guide cleanup.

**Changes**:
- `ink-hooks.ts`: delete local `useFocus` body (37-65), local `useFocusManager` body (70-87), `InkFocusContext` import (12), obsolete comment block (17-28). Replace with:
  ```ts
  export { useFocus } from "@silvery/ag-react/hooks/useFocus"
  export type { UseFocusOptions, UseFocusResult } from "@silvery/ag-react/hooks/useFocus"
  export { useFocusManager } from "@silvery/ag-react/hooks/useFocusManager"
  export type { UseFocusManagerResult as InkUseFocusManagerResult } from "@silvery/ag-react/hooks/useFocusManager"
  ```
  Silvery's `useFocusManager` already has Ink-compat aliases (`enableFocus/disableFocus/focusPrevious`) — no shim needed.
- `with-ink.ts`: remove `withInkFocus` import + composition line. `withInk()` collapses to `withInkCursor()` only (consider inlining — flag if churn <30 LOC, defer if more).
- `packages/ink/src/index.ts`: delete lines 17-18 barrel re-exports
- `packages/ag-term/src/plugins/index.ts`: delete lines 130-134 re-export block
- `packages/ink/package.json`: delete `./with-ink-focus` exports entry (41-43), `files` entry (64), tsdown entry
- **Delete `packages/ink/src/with-ink-focus.ts` entirely**
- `ink-render.ts`: shrink/delete `InkFocusBridge` (if silvery's default stack handles Tab via `with-focus.ts`, delete entirely; otherwise 5-line useInput+useFocusManager helper)

**Delete**: file + `InkFocusContext`, `InkFocusProvider`, `InkFocusContextValue`, `withInkFocus`, `WithInkFocusOptions`, `AppWithInkFocus`, internal `Focusable` type; subpath export; ag-term re-export; local hook bodies.

**New tests**: `tests/compat/ink/focus-reexport.test.tsx` (~40 LOC):
1. `import { useFocus } from "@silvery/ink"` === `import { useFocus } from "@silvery/ag-react"` (hook identity via `.toBe()`)
2. ink `render(<App/>)` with `useFocus({id:"a", autoFocus:true})` reports `isFocused:true`
3. Writing `\t` to stdin advances focus between two useFocus focusables — proves Tab dispatch routes through silvery FM

**/complete grep**:
- `test ! -f packages/ink/src/with-ink-focus.ts` → file gone
- `rg 'InkFocusContext|InkFocusProvider|InkFocusContextValue' packages/` → 0
- `rg 'withInkFocus|WithInkFocusOptions|AppWithInkFocus' packages/` → 0
- `rg 'with-ink-focus' packages/` → 0
- Hook identity test passes
- `bun run typecheck` + `bun vitest run tests/compat/ink` pass

---

### Phase 3: Dedupe + harden useFocus tests

**Changes**:
- Delete `vendor/silvery/tests/hooks/useFocus.test.tsx` (older duplicate)
- Keep `vendor/silvery/tests/features/use-focus.test.tsx` as canonical
- Verify coverage: explicit id, auto-generated id (no collisions), `autoFocus:true`, `isActive:false` (skipped in Tab cycle), interleaving with tree-based `useFocusable()`, `focus(id)` callback, `subscribe/getSnapshot` integration
- Add `focus-reexport.test.tsx` if not added in Phase 2

**Delete**: `tests/hooks/useFocus.test.tsx`

**/complete grep**:
- `rg --files tests/ | rg -i "use-focus\.test\." | wc -l` → 1
- `test ! -f tests/hooks/useFocus.test.tsx` → file gone
- Both test files pass

---

### Phase 4: Docs update

Per Case Study 3 (NewWay Documentation Drift), docs are code — cannot be deferred.

**Files**:
- `docs/getting-started/migrate-from-ink.md` — add Focus section: useFocus(options) from Ink works unchanged, now backed by silvery FocusManager with scopes/spatial nav/origin. Show import. Note `withInkFocus()` removed.
- `docs/guide/event-handling.md:323-344` — update useFocus section, note `@silvery/ink/useFocus` is a re-export
- `docs/reference/compatibility.md:155,167,194` — drop withInkFocus row from plugins table, rewrite "Replace focus" migration step
- `docs/reference/packages.md:142,145` — remove withInkFocus row + mention
- `docs/design/plugin-architecture.md:67-68` — remove withInkFocus rows or update `withInk()` note
- `docs/guide/silvery-vs-ink.md:284` — rewrite "Compat bridge" paragraph
- `tests/compat/ink/AUDIT.md:156,212` — update line counts + "~250 lines" note
- `packages/ink/README.md` — grep for withInkFocus
- `examples/` — scan for withInkFocus/InkFocusProvider refs

**/complete grep**:
- `rg 'withInkFocus' docs/ examples/ README.md` → 0
- `rg 'InkFocusProvider|InkFocusContext' docs/ examples/` → 0
- `rg 'useFocus' docs/getting-started/migrate-from-ink.md` → ≥1
- `bun run docs:build` succeeds
- **Epic verification**: `rg 'InkFocusContext|InkFocusProvider|withInkFocus|with-ink-focus' packages/ src/ tests/ docs/ examples/` → 0

---

### Phase 5 (DEFERRED — separate bead)

**`km-silvery.focusable-rename`**: `focused → isFocused` in `useFocusable` — breaking v1.0 change. NOT part of this epic. Create blocked bead now, leave for v1.0 planning. No backwards-compat alias (Core Lesson 4).

## Sequencing

```
Phase 1 (wire render to silvery FM)
    ↓
Phase 2 (delete with-ink-focus + re-export hooks)   ← bulk of work
    ↓
Phase 3 (dedupe tests)
    ↓
Phase 4 (docs)
    ↓
[Epic closed]

[SEPARATE BEAD] Phase 5: focused → isFocused rename
```

Each phase bead `depends on` previous via `bd dep add`. First note: "MANDATORY first step: Read docs/lessons/refactoring.md IN FULL."

## Risks

1. **Phase 1 may require fusing with Phase 2** — if Ink compat tests rely on hooks reporting real state BEFORE migration, split fails. Execute Phase 1 as dry run first (`git stash` + run suite). Do NOT add shims to power through.
2. **`silvery/ink` subpath barrel**: verify `vendor/silvery/src/ink.ts` or barrel doesn't export `withInkFocus`: `rg 'withInkFocus|with-ink-focus' vendor/silvery/src/`
3. **km consumers**: grep km before Phase 2 for `withInkFocus|InkFocusProvider|InkFocusContext` in packages/ apps/ — any `withInkFocus` consumer must be deleted as part of fix
4. **Rebase bead description BEFORE starting Phase 1**: bead says "no tests" but tests exist. Update to "tests exist but duplicated — dedupe in Phase 3" (Lesson 1).
5. **Run `/complete` after FINAL phase**, not per-phase — systematic drift catches systematic gaps.

## Critical files

- `vendor/silvery/packages/ink/src/with-ink-focus.ts` (DELETE)
- `vendor/silvery/packages/ink/src/ink-hooks.ts` (→ re-exports)
- `vendor/silvery/packages/ink/src/ink-render.ts` (drop provider, rewire bridge)
- `vendor/silvery/packages/ag-react/src/hooks/useFocus.ts` (reference, do not modify)
- `vendor/silvery/packages/ag/src/focus-manager.ts` (HookFocusable API, reference only)