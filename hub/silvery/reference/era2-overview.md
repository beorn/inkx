> **Partially stale (2026-04-11).** Composition architecture superseded by [app-composition.md](../design/v10-terminal/app-composition.md). Signals, commands, headless sections are still valid — see the individual docs in `design/v15-tea/`. Kept as historical overview.

# Era 2 Overview

_The map. Read this first, then the doc that owns what you're working on._

## What Is Era 2

Silvery era1 is "a better Ink" — React components rendered to the terminal. Era 2 decomposes the monolithic runtime into composable plugins, enabling multi-target rendering, framework independence, and optional app architecture.

Everything is a plugin. `create()` is zero-dep. Scope, rendering, app infrastructure — all opt-in.

## Era 2a vs Era 2b

**Era 2a — Rendering Foundation.** The cell-based rendering pipeline: ag (retained tree), term (output target), TextFrame (cell grid). Three-phase pipeline (layout → render → paint). Plugin composition via `pipe()`. Framework adapters (React, Svelte). Input dispatch. No signals, no commands, no TEA.

**Era 2b — App Architecture.** Optional infrastructure for complex apps: signals (reactive state), commands (discoverable actions), keymaps, scopes (structured concurrency), domain plugins. Builds on era2a's `create()` + `dispatch/apply` foundation. Fully opt-in — era2a apps work with just React `useState`.

**The boundary:** era2a is `create()` + `withAg()` + `withTerm()` + `withReact()` + `withTest()`. Era2b adds `withApp()` + domain plugins + signals + commands + keymaps.

## Three Levels

| Level                   | What you add                            | State                 | Input                      |
| ----------------------- | --------------------------------------- | --------------------- | -------------------------- |
| **Foundation**          | `create()`                              | none                  | ops pass through           |
| **+ Rendering** (era2a) | `withAg()`, `withTerm()`, `withReact()` | React useState        | `useInput()` in components |
| **+ App** (era2b)       | `withApp()`, domain plugins             | signals (recommended) | keymap → commands → state  |

```ts
// Era2a — rendering only
const app = pipe(
  create(), withAg(),
  withTerm(createTerm(process)),
  withReact({ view: <Counter /> }),
)
await app.run()

// Era2b — full app architecture
const app = pipe(
  create(), withScope(), withAg(),
  withTerm(createTerm(process)),
  withApp(),
  todoDomain(), editorDomain(),
  withReact({ view: <App /> }),
)
await app.run()
```

## Five Graphs

A silvery app is composed of five interconnected structures:

| Graph                   | What                                                   | Shape | Era |
| ----------------------- | ------------------------------------------------------ | ----- | --- |
| **Plugin chain**        | dispatch/apply/run wrapping layers                     | Stack | 2a  |
| **Ag node tree**        | Abstract UI structure. Adapter writes, renderer reads. | Tree  | 2a  |
| **Reactive data graph** | Signals connected by computeds                         | DAG   | 2b  |
| **Command tree**        | Action namespace. Discoverable, projectable.           | Tree  | 2b  |
| **Async scope tree**    | Spawned async work, cancellation, errors               | Tree  | 2b  |

A keypress traverses the plugin chain, resolves a command (command tree), executes it in a scope (scope tree), mutates signals (reactive graph), which triggers a re-render of the UI (ag node tree).

## File Map

Target structure after reorganization. Do the renames first, then update content.

### Design docs

```
era2/
  00-overview.md                          ← this file (NEW)

  era2a/                                  ← rendering foundation (ships first)
    rendering.md                          ← from app-composition.md + best of 01-rendering-input.md
    composability.md                      ← from composability.md

  era2b/                                  ← app architecture (ships later as silvertea)
    signals.md                            ← from 02-signals.md
    commands.md                           ← from 03-commands.md
    app.md                                ← from 04-app.md + withApp/domain code from old 00
    headless.md                           ← @silvery/headless API spec (NEW)
    examples.md                           ← from 01-rendering-input.md full examples (NEW)

  refs/                                   ← reference material (cross-cutting)
    decisions.md                          ← from decisions.md (append-only)
    example-checklist.md                  ← from example-checklist.md
    migration.md                          ← from migration-render-to-app.md
    playground.md                         ← from playground.md
    signals-landscape.md                  ← from signals-landscape-2026.md

  archive/                                ← superseded docs (deprecation headers)
    00-architecture.md                    ← old monolith
    01-rendering-input.md                 ← old rendering deep-dive
    packaging.md                          ← absorbed into 00-overview
```

### Source packages → design doc mapping

Each design doc owns the packages it specifies. This is where to look before editing source.

```
Era 2a packages (rendering foundation)
────────────────────────────────────────────────────────────────
@silvery/create          era2a/rendering.md    create(), pipe(), dispatch/apply
  packages/create/                             (NEW — extract from ag-term)

@silvery/ag              era2a/rendering.md    node types, focus, pipeline interface, TextFrame
  packages/ag/

@silvery/ag-react        era2a/rendering.md    React reconciler, mountReact(), useInput
  packages/ag-react/
  packages/ag-react/ui/                        30+ React components

@silvery/ag-term         era2a/rendering.md    terminal renderer, Term, createTerm, paint
  packages/ag-term/

@silvery/theme           era2a/rendering.md    semantic tokens, palettes
  packages/theme/

@silvery/test            era2a/rendering.md    withTest(), createTermless, locators
  packages/test/

Era 2a packages (composability — future)
────────────────────────────────────────────────────────────────
@silvery/ag-exp-web      era2a/composability.md  CSS/DOM mapping
@silvery/ag-exp-canvas   era2a/composability.md  canvas draw calls
@silvery/ag-exp-svelte   era2a/composability.md  Svelte adapter

Era 2b packages (app architecture — silvertea)
────────────────────────────────────────────────────────────────
@silvery/scope           era2b/app.md          withScope, createScope, structured concurrency
  packages/scope/                              (NEW — extract from ag-term)
                                               shared infra: era2a uses optionally, extracted in era2b

@silvery/headless        headless.md           pure state machines (SelectListState, ReadlineState, ...)
  packages/headless/                           (NEW — extract from ag-react/ui)
                                               shared infra: era2a components use, extracted in era2b

@silvery/commands        era2b/commands.md     command tree, keymap, when(), registry
  packages/commands/                           (NEW)

@silvery/signals         era2b/signals.md      signal, computed, effect, batch (alien-signals)
  packages/signals/                            (NEW)

@silvery/model           era2b/signals.md      createModel, DI factories
  packages/model/                              (NEW)

@silvery/impure          era2b/app.md          native framework bridges (no ag) — future
  packages/impure/

Bundles
────────────────────────────────────────────────────────────────
silvery                  00-overview.md        everything (create + ag + term + commands + signals + ...)
  src/                                         barrel re-exports
```

### Public docs (silvery.dev) → design doc mapping

```
silvery.dev (era2a — ships first)
────────────────────────────────────────────────────────────────
getting-started/         era2a/rendering.md    render(), components, hooks
guide/components/        era2a/rendering.md    Box, Text, component library
guide/testing/           era2a/rendering.md    withTest, createTermless, locators
guide/styling/           era2a/rendering.md    theme tokens, palettes
guide/the-silvery-way/   era2a/rendering.md    canonical patterns
examples/                era2a/rendering.md    render()-only demos
migrate-from-ink/        refs/migration.md     Ink compat layer
api/                     era2a/rendering.md    shipped API reference only

silvery.dev (era2b — ships later, gated until ready)
────────────────────────────────────────────────────────────────
guide/app-architecture/  era2b/app.md          withApp, scopes, domain plugins
guide/signals/           era2b/signals.md      reactive state
guide/commands/          era2b/commands.md     command tree, keymaps
examples/advanced/       era2b/examples.md     Todo, Chat with signals+commands
```

**Rename order**: create dirs → move files → add deprecation headers to archive → update cross-references.

## Doc Ownership

Each subsystem has one canonical doc. If two docs disagree, the owner doc wins.

| Doc                                                         | Owns                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| [composability.md](../design/v10-terminal/composability.md) | Framework×platform matrix, adapters, gap analysis                    |
| [signals.md](../design/v15-tea/signals.md)                  | signal(), computed(), createModel(), createStore(), createResource() |
| [commands.md](../design/v15-tea/commands.md)                | Command tree, surfaces, availability, keymaps, resolution            |
| [app.md](../design/v15-tea/app.md)                          | withApp(), scopes, domain plugins, structured concurrency            |
| [headless.md](../design/v15-tea/headless.md)                | @silvery/headless: pure state machines for interactive components    |
| [decisions.md](./decisions.md)                              | Append-only decision log (37 decisions)                              |
| [example-checklist.md](./example-checklist.md)              | Example quality standards                                            |
| [migration.md](./migration.md)                              | render() → createApp() migration                                     |
| [playground.md](./playground.md)                            | Canvas playground design                                             |
| [signals-landscape.md](./signals-landscape.md)              | JS signals ecosystem research                                        |

Rendering evolved from [app-composition.md](../../silvery/docs/design/app-composition.md).

## Packages & Dependencies

Two naming groups under `@silvery/*`: **`ag-*`** for rendering (Ag = chemical symbol for silver), **descriptive names** for app level. See [archive/packaging.md](../archive/era2-drafts/packaging.md) for historical details.

```
Foundation (shared — zero rendering deps, used by both eras):
  @silvery/create                         zero deps — pipe, dispatch, apply, tea()
  @silvery/scope                          zero deps — withScope, createScope
                                          (shared infra: era2a uses optionally, era2b requires.
                                           Documented in era2b/app.md. Extracted in era2b.)
  @silvery/headless                       create — pure state machines (no rendering dep)
                                          (shared infra: era2a components use, era2b extracts.
                                           Documented in era2b/app.md.)

Rendering (era2a):
  @silvery/ag                             create — node types, focus, pipeline interface
  @silvery/ag-react                       ag, peer: react — reconciler + /ui components
  @silvery/ag-term                        ag, scope, flexily — terminal renderer
  @silvery/theme                          no deps — semantic tokens, palettes
  @silvery/test                           ag-term, termless — withTest, locators

App (era2b):
  @silvery/commands                       create — command tree, keymap, when, registry
  @silvery/signals                        alien-signals — signal, computed, effect, batch
  @silvery/model                          signals — createModel, DI factories

Experimental (future):
  @silvery/ag-exp-svelte                  ag, peer: svelte
  @silvery/ag-exp-web                     ag — CSS/DOM mapping
  @silvery/ag-exp-canvas                  ag, flexily — draw calls
  @silvery/impure                         headless, commands — native framework bridges (no ag)

Bundle:
  silvery                                 create + scope + headless + commands + signals
                                          + model + ag + ag-react + ag-term + theme
```

## Implementation Phases

### Era 2a (rendering foundation)

Each phase: Update → Absorb → Purge → Remove → Fix (see [refactoring lessons](../../../docs/lessons/refactoring.md)).

**Zero WIP between phases.** Each phase ships a clean codebase — no TODO comments, no deprecated shims, no "old + new" coexistence, no compat re-exports, no deferred work. The old API is deleted in the same phase that introduces the new one. `grep` for old patterns must return 0 hits before `/complete`. If a phase can't fully delete the old path, the phase scope is wrong — shrink it until it can.

**No deferred work** unless there is a concrete technical reason (e.g., a dependency hasn't been extracted yet). If work must be deferred, it must be: (1) tracked as a bead with the same `/complete` criteria, (2) inserted into the phase plan at the correct point, (3) blocking subsequent phases, and (4) never left as a TODO comment in code. "Phase N will handle deletion" is the #1 refactoring anti-pattern — it never happens (see [refactoring lessons](../../../docs/lessons/refactoring.md)).

**Phase 1: TextFrame** (`km-silvery.era2a-1-textframe`)
Extract immutable TextFrame snapshot type from existing TerminalBuffer. TextFrame is a detached immutable copy, NOT a live wrapper/view.

- `ag/src/text-frame.ts` — NEW: TextFrame type + FrameCell type (shared between silvery + termless)
- `ag-term/src/buffer.ts` — add TextFrame snapshot factory (immutable copy, not a live view)
- `test/` — termless screen already returns similar shape; align to TextFrame interface
- `toAnsi(frame, caps?)` — NEW standalone function (not on TextFrame)

**Delete**: remove all public read access via TerminalBuffer (`.getText()`, `.getCell()`, etc.). Only TextFrame for reading. TerminalBuffer stays internal (write-only, pipeline use).
**/complete**: `grep` for public TerminalBuffer read access → 0 hits. All consumers use TextFrame. Docs/examples updated. CLAUDE.md updated if public API changes.

**Phase 2: term.paint()** (`km-silvery.era2a-2-paint`)
Add paint method to Term, wrapping existing flush. Delete old public flush.

- `ag-term/src/ansi/term.ts` — add `paint(frame, prev?)` and `term.screen` field
- `ag-term/src/render-adapter.ts` — make `flush()` private/internal

**Delete**: remove public `RenderAdapter.flush()`. All callers use `term.paint()`.
**/complete**: `grep` for `\.flush(` in consumer code → 0 hits. `grep` for public `RenderAdapter` exports → 0 hits. Docs/examples show term.paint() not flush(). CLAUDE.md updated if public API changes.

**Phase 3: ag.layout() + ag.render()** (`km-silvery.era2a-3-pipeline`)
Decompose opaque `runPipeline()` into two independent phases. Delete old entry points.

- `ag-term/src/pipeline/index.ts` — replace `executeRender()` with `ag.layout()` + `ag.render()`
- `ag-term/src/pipeline/layout-phase.ts` — becomes `ag.layout(dims)`: measure + flexbox → positions/sizes
- `ag-term/src/pipeline/measure-phase.ts` — merge into layout-phase (measure is a sub-step of layout)
- `ag-term/src/pipeline/render-phase.ts` — becomes `ag.render()` (renamed from content-phase.ts)
- `ag-term/src/pipeline/output-phase.ts` — inline into `term.paint()` (no separate phase)
- `ag/src/index.ts` — introduce minimal `createAg({ engine })` factory (pipeline binding only; tree mutation API extends in Phase 4)
- `ag-term/src/layout-engine.ts` — replace global `setLayoutEngine()`/`getLayoutEngine()` with `createAg({ engine })` binding
- `ag-react/src/reconciler/nodes.ts` — `calculateLayout()` calls `ag.layout()` directly

**Delete**: remove `executeRender()`, `runPipeline()`, `setLayoutEngine()`, `getLayoutEngine()`. Remove `output-phase.ts` (absorbed into paint). Remove `measure-phase.ts` (merged into layout).
**/complete**: `grep` for `executeRender\|runPipeline\|setLayoutEngine\|getLayoutEngine` → 0 hits. Docs/examples updated. CLAUDE.md updated if public API changes.

**Phase 4: ag tree mutation API + focus** (`km-silvery.era2a-4-tree-api`)
Replace direct node/layout-node manipulation with ag-owned API. Move focus into ag (affects useInput dispatch — era2a, not era2b).

- `ag/src/index.ts` — extend `createAg()` factory (from Phase 3) with: createNode, insertChild, removeChild, updateNode, setText
- `ag/src/focus.ts` — focus system already in @silvery/ag (focus-manager.ts, focus-events.ts); verify API surface, add missing methods
- `ag-react/src/reconciler/nodes.ts` — rewrite to use `ag.createNode()` instead of `getLayoutEngine().createNode()`
- `ag-react/src/reconciler/` — all tree mutations go through ag API

**Delete**: remove direct `layoutNode` access from reconciler. Remove direct `LayoutEngine` usage outside ag. Remove focus code from ag-term.
**/complete**: `grep` for `\.layoutNode` in reconciler → 0 hits. `grep` for `getLayoutEngine` outside ag/ → 0 hits. Focus lives in `ag/`, not `ag-term/`. Docs/examples updated. CLAUDE.md updated if public API changes.

**Phase 5: Plugin composition** (`km-silvery.era2a-5-plugins`)
Wire everything as composable plugins. Rewrite existing entry points — don't add alongside.

- `create/src/index.ts` — NEW package: `create()`, `pipe()`, dispatch/apply (extract from ag-term runtime)
- `ag-term/src/runtime/` — decompose into `withAg()`, `withTerm()`, event loop
- `ag-react/src/` — extract `withReact()` plugin
- `test/src/` — extract `withTest()` plugin
- `ag-term/src/runtime/run.tsx` — REWRITE as `pipe(create(), withAg(), withTerm(), withReact())`. DELETE RunHandle.
- `ag-react/src/test-utils.ts` — REWRITE as `render()` + `withTest()`. DELETE createRenderer.
- `ag-term/src/runtime/create-app.tsx` — QUARANTINE (untouched until era2b-app; no new consumers)

NOTE: `withApp()` is era2b — NOT in this phase. `create-app.tsx` is quarantined until era2b.

**Delete**: remove RunHandle, createRenderer, old `run()` internals. No dual paths (old entry point + new plugin both working).
**/complete**: `grep` for `RunHandle\|createRenderer` → 0 hits. All runtime flows through `pipe()`. Docs/examples updated. CLAUDE.md updated.

**Phase 6: Term unification + cleanup** (`km-silvery.era2a-6-unification`)
One Term type across all backends. Remove remaining old APIs. Clean barrel exports.

- `ag-term/src/ansi/term.ts` — Term is THE type (dims + optional paint/events/screen/caps/cursor)
- `ag-term/src/render-adapter.ts` — DELETE entirely (all behavior absorbed by term.paint + ag.render)
- `ag-term/src/runtime/create-app.tsx` — QUARANTINE: remove from silvery barrel export (era2b-only)
- `silvery/src/index.ts` — add public `render(view, term)` convenience function
- `test/src/` — formalize `createTermless()` returns a Term with screen/scrollback
- All backends (ansi, emulator, headless) return same Term shape

**Delete**: RenderAdapter file/type. AppHandle export from barrel. Any structural TermDef type (bare `{ cols, rows }` accepted inline). Old convenience APIs that duplicate pipe().
**/complete**: `grep` for `RenderAdapter` → 0 hits. `grep` for `export.*AppHandle` in barrel → 0 hits. `grep` for `TermDef` → 0 hits. All Term backends same shape. Docs/examples/README/CLAUDE.md updated.

### Era 2b (app architecture)

Ships later as silvertea. Era2b Phase 0 requires `@silvery/create` to exist as a package — which happens in era2a Phase 5. Start era2b after era2a Phase 5, or extract the create kernel earlier if parallel work is needed.

**Phase 0: tea() in @silvery/create**

- `create/src/tea.ts` — move `tea()` reducer utility from `@silvery/tea` into create package (~30 lines)
- `packages/tea/` — DELETE package entirely. Fix all imports. No deprecated re-exports.

**Phase 1: @silvery/headless** (see [headless.md](../design/v15-tea/headless.md))
Extract pure `(state, action) → state` machines from React components.

- `headless/` — NEW package: SelectListState, ReadlineState, ListNavigatorState, ToggleState, TabGroupState, CommandPaletteState
- `headless/keys/` — default key-to-action maps (subpath, depends on @silvery/ag for Key type)
- `ag-react/ui/` — components become thin React wrappers over headless machines via `useReducer`
- Prototype validated at `prototype/headless/` (50 tests passing)

**Phase 2: @silvery/commands**
Extract command system.

- `commands/` — NEW package: command tree, keymap, `when()`, registry, resolution
- Depends only on `@silvery/create`

**Phase 3: @silvery/ag — node types**

- `ag/src/` — node type extraction (focus already in ag since era2a Phase 4)

**Phase 4: @silvery/ag-react/ui — component refactor**

- `ag-react/ui/` — components use headless state + commands. No direct zustand.

**Phase 5: @silvery/signals**

- `signals/` — NEW package: alien-signals wrapper (signal, computed, effect, batch, createStore, createResource)

**Phase 6: @silvery/model**

- `model/` — NEW package: createModel(), DI factories. Depends on signals.

**Phase 7: km migration**

- `apps/km-tui/` — migrate from tea store to era2b domain plugins

## Key Decisions

See [decisions.md](./decisions.md) for the full log. Highlights:

- **D26-28**: alien-signals as reactive engine. Callable accessors (`count()` / `count(5)`).
- **D29**: Getter/setter function-call pattern, not `.value`.
- **D30**: Commands are state-agnostic (no signal dependency).
- **D31**: `@silvery/tea` dissolves into create + commands + headless.
- **D34**: Signals and model are optional. Rendering has zero signal deps.
- **D36**: Providers dissolve into plugins. `Pick<typeof app, ...>` for DI.
- **D37**: Era2a/era2b split. Rendering foundation independent of app architecture.

## Principles

1. **Composability** — pipe + plugins. Infrastructure, domains, and rendering compose freely.
2. **Type inference** — infer from factories and schemas. Minimize explicit annotations.
3. **Objects over strings** — TypeScript references primary. Strings only for serialization.
4. **Ergonomics** — obvious APIs. One way to do things.
5. **No `this`** — closure access and parameters only.

## Public Docs & Launch Strategy (silvery.dev)

**Era2a launches independently.** The public site must tell a complete, uncluttered story with just the renderer — no "coming soon" placeholders, no half-designed TEA references. Era2b ships later as a separate announcement.

The internal era2a/era2b split maps to two public identities:

- **silvery** (renderer) — era2a: components, hooks, rendering, testing, themes. The "React for terminals" story. What you get from `import { render } from "silvery"`. This is the primary product — most users never need the app framework.
- **silvertea** (app framework) — era2b: signals, commands, keymaps, scopes, domain plugins. The "architecture for complex apps" story. What you get from `import { createApp } from "silvery"`. Optional, progressive — you add it when `useState` isn't enough.

**Before era2a launch, the silvery.dev docs need a pass:**

- Remove or gate any era2b content (commands, signals, createApp, TEA) behind a clear "App Framework (coming soon)" section or move to a separate silvertea.dev/guide path
- The getting-started, components, hooks, and testing guides should be pure era2a
- Examples should work with just `render()` + `useState` — no signals/commands
- API reference should only include shipped APIs
- Migration guide (from Ink) is era2a-only

Each era2a/era2b design doc should note what public docs it maps to and what needs updating on silvery.dev when the design ships.

## Read Order

**Starting era2a work:** this overview → era2a/rendering.md → implement.

**Starting era2b work:** this overview → era2b/signals.md → era2b/commands.md → era2b/app.md → headless.md → implement.

**Understanding the big picture:** this overview → era2a/composability.md.
