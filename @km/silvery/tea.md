---
id: "@km/silvery/tea"
aliases:
  - km-silvery.tea
  - km-silvery-tea
created_by: claude:491faf6c
created_at: 2026-03-25T05:56:19Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea
    depends_on_id: km-silvery.architectural-plateau
    type: blocks
    created_at: 2026-04-24T23:16:27Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvery.tea
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T08:36:42Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Silvery tea (v1.5): app architecture — signals, commands, scopes @km/silvery #epic #P0

blocks:: [[@km/silvery/architectural-plateau]], [[@km/silvery/selection-focus-plateau]]

# Refactor Plan: @km/silvery/tea — Phases 2, 3, 4

## Verified current state

- **Phase 1 (shipped v0.17.0) is partial**: `create() + pipe()` exist as packages, but `create-app.tsx` is a 2,978-line monolith at `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx`. The `with-*.ts` files in `@silvery/create/src/` are 5-line re-exports — real plugin bodies still live inside `ag-term/runtime`. Comments at line 1300 claim "V1r apply chain" but `processEventBatch` (lines 2261-2437) still uses raw `runtimeInputListeners` / `runtimePasteListeners` arrays, hardcoded `handleFocusNavigation`, and `RuntimeContext.on("input" | "paste" | "focus")` for hook registration.
- **v15-tea/plugin-system-v1r.ts is runnable**, not a sketch. 427-line executable TS demo with `demo()` at the bottom. Validates apply-chain contract but has no ag tree, no React, no real I/O. Treat as **contract spec**, not production code.
- **aichat-v2 prototype** (816-line app.tsx + 684 lines of shims in `vendor/internal/silvery/prototype/aichat-v2/`): imports `@silvery/ag-react` for views but EVERYTHING architectural comes from `./shims/`. Runs against shims, not real runtime. Intent per bead: **validation only, not shipping**. Shipping flagship is tracked separately as `km-silvery.tea.aichat-polish` (P2).
- **@km/tui/tea** is downstream of Phase 4 — it's where domain plugins (withBoard/withSelection/withTree/...) live. Out of scope for @km/silvery/tea.

## Answers to the three flagged questions

- **(a) v1r prototype runnable?** Yes — `bun vendor/internal/silvery/design/v15-tea/plugin-system-v1r.ts` runs 8 demo scenarios. But it's a contract spec, not production.
- **(b) aichat-v2 ship or validate?** Validate only. Framework validation stays in `vendor/internal/silvery/prototype/`. Handoff to `km-silvery.tea.aichat-polish` for flagship-quality example.
- **(c) ag-test-coverage as prerequisite?** **Yes — as Phase 2a (blocker, not merged).** Phase 2 rewrites exactly the code `ag-test-coverage` would lock in tests for. Doing Phase 2 without that test bed = refactoring blindfolded. Keep as separate bead, mark blocking tea-useinput.

---

## Phase 2a (prereq): Pipeline test coverage

**Bead**: `km-silvery.ag-test-coverage` (existing, P0). Add dependency: blocks `km-silvery.tea-useinput`.

**Scope**: Lock current `processEventBatch` semantics in tests BEFORE Phase 2 rewrites it. Tests: `usePaste` (simple + rich modes), `useExit`, `useInputLayer` (layered bubbling), Stage-3 pipeline (modifier/release events reach modifier store but NOT useInput; focused > useInput; "flush" render barrier).

**New files**:
- `vendor/silvery/tests/runtime/pipeline-stage3.test.tsx`
- `vendor/silvery/tests/runtime/use-paste.test.tsx`
- `vendor/silvery/tests/runtime/use-exit.test.tsx`
- `vendor/silvery/tests/runtime/use-input-layer.test.tsx`

**Delete**: nothing.
**/complete**: all 4 files exist + `bun vitest run vendor/silvery/tests/runtime/` passes + tests use `createTermless|createRenderer` (real pipeline, not mocks).

---

## Phase 2: Decompose processEventBatch into plugin apply chain

**Bead**: `km-silvery.tea-useinput` (existing, P1 — bump to P0 after 2a lands).

**Scope**: Replace `runtimeInputListeners`/`runtimePasteListeners`/`runtimeFocusListeners` arrays + hardcoded `handleFocusNavigation` inside `processEventBatch` with a real `pipe()` apply chain internal to createApp. Consumer API (`run`, `createApp`, `useInput`, `usePaste`, `useExit`, `useInputLayer`) stays identical — purely internal refactor.

**Target contract**: `createApp` calls `pipe(create(), withTerm, withInput, withPaste, withFocus, withTracing?)`. `apply()` returns `ApplyResult = false | Effect[]`. Focus dispatch via `withFocus`; "consumed" = `[]`, "not consumed" = `false`. Hooks register into plugin stores, not `RuntimeContext.on`. Ctrl+C/Ctrl+Z become lifecycle effects. Render barrier = `Effect {type:"render-barrier"}`. Modifier tracking = observer lane in `withTerm`.

**Files — code moves OUT of ag-term/create-app.tsx**:
- `processEventBatch` event loop → `vendor/silvery/packages/create/src/runtime/event-loop.ts` (NEW)
- Focus precedence → `vendor/silvery/packages/create/src/with-focus.ts` (rewrite 5-line stub)
- Paste routing → `vendor/silvery/packages/create/src/with-paste.ts` (NEW)
- Modifier observer → `vendor/silvery/packages/create/src/with-terminal.ts` (rewrite 5-line stub)
- Fallback useInput store → `vendor/silvery/packages/create/src/with-input.ts` (NEW)
- Ctrl+C/Ctrl+Z/exit/suspend handlers → `vendor/silvery/packages/create/src/runtime/lifecycle-effects.ts` (NEW)
- `ApplyResult`/`Effect`/`Op` types → `vendor/silvery/packages/create/src/types.ts` (extend)

**Files rewritten in place**:
- `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` — shrink 2,978 → ≤1,200 lines
- `vendor/silvery/packages/ag-react/src/hooks/{useInput,usePaste,usePasteCallback,usePasteEvents,useInputLayer,useExit,useModifierKeys}.ts` — re-point from `RuntimeContext.on` to plugin stores

**Docs rewritten**:
- `vendor/silvery/docs/design/app-composition.md`
- `vendor/silvery/docs/guide/input-architecture.md`
- `vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md`
- `vendor/silvery/CLAUDE.md`
- Move `v15-tea/plugin-system-v1r.ts` → `v15-tea/archive/` (it's now shipped code)

**Deletions** (not deprecation):
- `runtimeInputListeners` / `runtimePasteListeners` / `runtimeFocusListeners` arrays in `create-app.tsx`
- `runtimeEventListeners` Map + `RuntimeContextValue.on`/`.emit` event bus
- `handleFocusNavigation` as top-level function
- All `runtime.on("input"|"paste"|"focus", …)` call sites in ag-react hooks
- v1r prototype moved to archive (don't leave "design" claim once shipped)
- **No shims, no @deprecated, no dual path**

**New tests** (era2 rule — same commit):
- `vendor/silvery/packages/create/tests/with-{focus,input,paste,terminal}.test.ts`
- `vendor/silvery/packages/create/tests/event-loop.test.ts` (Ctrl+C/Z effects, render barrier, effect draining, reentry guard)
- Phase 2a tests must pass unchanged (behavioral equivalence proof)

**/complete grep**:
- `rg 'runtimeInputListeners|runtimePasteListeners|runtimeFocusListeners' vendor/silvery/packages/` → 0
- `rg 'RuntimeContext(Value)?' vendor/silvery/packages/` → 0 in source
- `rg 'runtime\.on\(["\x27]input' vendor/silvery/packages/ag-react/` → 0
- `rg 'handleFocusNavigation' vendor/silvery/packages/` → 0
- `wc -l vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` → ≤1200
- `wc -l vendor/silvery/packages/create/src/with-{focus,terminal,input,paste}.ts` → each ≥40
- `ls vendor/internal/silvery/design/v15-tea/plugin-system-v1r.ts` → does NOT exist; archive version does
- Full `bun vitest run vendor/silvery/` passes

**Dependencies**: blocked by Phase 2a. NOT blocked by Phase 3. Ships as silvery v0.18.0 (internal refactor, no API change).

---

## Phase 3: Validate full TEA via aichat-v2 spike

**Bead**: `km-silvery.tea-aichat` (existing, P2).

**Scope**: Run aichat-v2 against REAL `@silvery/create` + `@silvery/ag-react` from Phase 2, delete shims, document API gaps. Prove `withCommands`, `withScope`, `withKeymap`, `when()`, `signal/computed/useModel`, effects-as-data all work end-to-end in a non-trivial app with real stdin/focus/lifecycle. Fix divergences (app.providers, inline model, module-level `_chat`, no op() proxy).

**New framework source** (driven by gaps the spike surfaces — ceiling not floor):
- `vendor/silvery/packages/create/src/with-scope.ts` (withScope plugin)
- `vendor/silvery/packages/commands/src/with-commands.ts` (rewrite stub to match spike contract)
- `vendor/silvery/packages/commands/src/when.ts` (conditional keybinding combinator)
- `vendor/silvery/packages/signals/src/use-model.ts` (useModel React bridge)
- `vendor/silvery/packages/create/src/extend.ts` (or prove unnecessary)
- `vendor/silvery/packages/commands/src/op-proxy.ts` (decide: add op() serializable dispatch or remove from designs)

**Spike rewritten**:
- `vendor/internal/silvery/prototype/aichat-v2/app.tsx` — delete `./shims/*` imports, use real packages
- `vendor/internal/silvery/prototype/aichat-v2/app.test.ts` — run under `@silvery/test` real runtime

**Docs**:
- `vendor/internal/silvery/design/v15-tea/{commands,signals,headless}.md` — mark shipped or defer explicitly
- `vendor/silvery/docs/guide/providers.md` — add withCommands/withScope/when() sections

**Deletions**:
- Entire `vendor/internal/silvery/prototype/aichat-v2/shims/` directory (~684 lines: app.ts 235, clock.ts, commands.ts, scope.ts, signals.ts, terminal.ts)
- Any spike API the framework can't support → delete from spike, NOT add a shim

**New tests**: spike test against real runtime; every new framework API ships with test + barrel export + docs section (era2 rule).

**/complete grep**:
- `ls vendor/internal/silvery/prototype/aichat-v2/shims` → does not exist
- `rg 'from ["\x27]\./shims' vendor/internal/silvery/prototype/aichat-v2/` → 0
- `rg 'TODO|FIXME|XXX' vendor/internal/silvery/prototype/aichat-v2/` → 0
- Every new API has test + barrel export + providers.md mention
- `bun vendor/internal/silvery/prototype/aichat-v2/app.tsx` runs interactively

**Handoff**: file `km-silvery.tea.aichat-polish` with gap list between "works" and "flagship demo quality". Ships as silvery v0.19.0.

**Dependencies**: blocked by Phase 2. NOT blocked by aichat-polish (downstream).

---

## Phase 4: km migration onto TEA packages

**Bead**: `km-silvery.tea.migration` (existing, P2).

**Scope**: @km/tui adopts `@silvery/commands`, `@silvery/signals`, `@silvery/headless`, `@silvery/create` (plugin form). This is the substrate that unblocks `km-tui.tea`'s domain plugins (withBoard/withSelection/withTree/withEditor). @km/_orphan/side only; no silvery change.

**Sub-ordering**:
- **4a. Commands** — replace manual key handlers in `packages/km-tui/src/input/*` with `@silvery/commands` registry. Delete manual keymap tables in same commit.
- **4b. Signals** — migrate @km/tui reactive state (board signals, cursor, view mode) onto `@silvery/signals` wrappers. Delete ad-hoc signal helpers.
- **4c. Headless machines** — replace bespoke SelectList/Readline code in @km/tui with `@silvery/headless`. Delete local copies.
- **4d. App composition** — rewrite `packages/km-tui/src/app.tsx` from `createApp({...})` object style to `pipe(create(), withTerm, withReact, withDomEvents, withFocus, withCommands, ...)`. Delete legacy call shape.

**Files** (km side):
- `packages/km-tui/src/input/*.ts` (delete manual handlers)
- `packages/km-tui/src/board/board-app-store.ts` (re-point to @silvery/signals)
- `packages/km-tui/src/board/board-actions.ts` (migrate to command invocation)
- `packages/km-tui/src/app.tsx` / top-level (rewrite to pipe())

**Deletions**:
- Manual keymap tables (hardcoded `{"j": moveDown}` objects)
- `silvery/runtime` `useInput` calls that are actually global commands (keep only truly component-local useInput)
- Local `createSlice` / signal helpers once @silvery/signals covers them
- `createApp({...})` object-style call sites in km — pipe() form only
- @km/_orphan/side re-exports of silvery internals

**/complete grep**:
- `rg 'createApp\s*\(\s*\{' packages/km-tui/ packages/km/` → 0
- `rg 'from ["\x27]silvery/runtime["\x27]' packages/km-tui/src/input/` → 0
- `rg '@silvery/commands' packages/km-tui/src/ | wc -l` → ≥1
- `rg '@silvery/signals' packages/km-tui/src/ | wc -l` → ≥1
- `rg '@silvery/headless' packages/km-tui/src/ | wc -l` → ≥1
- km app.tsx contains literal `pipe(create(), ...)`
- `bun run test` + `bun run typecheck` green

**Dependencies**: blocked by Phase 3 for ANY new @silvery/* API the spike added. NOT blocked by `km-tui.tea` — migration is the substrate; @km/tui/tea builds on top.

---

## Sequencing

```
Phase 2a: ag-test-coverage      → silvery v0.18.0-rc (tests only)
Phase 2:  tea-useinput          → silvery v0.18.0    (internal refactor)
Phase 3:  tea-aichat            → silvery v0.19.0    (new API shipped + validated)
Phase 4:  tea.migration         → km adopts          (km-side only)
(unblocks) km-tui.tea             → domain plugins
```

**Can silvery ship TEA packages without @km/tui/tea landing?** YES — silvery is decoupled. Phases 2/3 ship silvery releases independently. Phase 4 pulls them into km. @km/tui/tea is the LAYER ABOVE migration, not a blocker for silvery releases.

## Tracking bead updates needed

- `km-silvery.tea` epic → replace 4-line Phases block with links to per-phase DoD
- `km-silvery.ag-test-coverage` → add "blocks @km/silvery/tea-useinput"; consider promoting as Phase 2a
- `km-silvery.tea-useinput` → expand with file inventory + grep criteria from Phase 2
- `km-silvery.tea-aichat` → flag validation-only; link aichat-polish as shipping bead
- `km-silvery.tea.migration` → expand with 4a/4b/4c/4d sub-ordering; restate blocks @km/tui/tea not vice versa

## Cross-phase risks mitigated

1. **Doc drift** — every phase lists specific .md files, including internal v15-tea/ and v10-terminal/
2. **Copy without delete** — Phase 2 deletes RuntimeContext.on + stub re-exports; Phase 3 deletes shims/; Phase 4 deletes object-form createApp
3. **Aspirational done** — exact grep commands + file existence checks, not narrative bullets
4. **Renamed not deleted** — Phase 2 checks both that new plugin files have bodies AND old Map/array names are gone
5. **Wrapped not eliminated** — Phase 2 has LOC target on create-app.tsx (≤1,200 from 2,978) — must measure before closing
6. **Speculative completeness** — Phase 3 refuses to add APIs the spike doesn't exercise; anything aspirational goes to aichat-polish or new bead, not framework stub