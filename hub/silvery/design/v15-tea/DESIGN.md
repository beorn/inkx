# Silvery App Architecture — Design

> **Canonical.** Iterate here. Don't start new design docs for this topic. Other docs in this folder (`commands.md`, `signals.md`, `headless.md`, `selection.md`) are historical reference; they get updated at rollout.

**Prototypes** (must always match current decisions): `prototypes/minimal.ts`, `prototypes/middle.ts`, `prototypes/canonical.ts`, `prototypes/q1-nested-commands.ts`, `prototypes/q2-input-dispatch.ts`, `prototypes/q3-effects.ts`, `prototypes/q5-args-schema.ts`, `prototypes/q6-keymap.ts`, `prototypes/q8-cross-plugin-dispatch.ts`, `prototypes/q9-test-harness.ts`, `prototypes/q15-serialization.ts`.

---

## Design Decisions (Unified Numbering)

Questions and decisions use the same numbering space. [x] = decided, [ ] = open.

### Framework Core

- [x] **D1** — Framework surface is `scope()` + `pipe()` only. Every seam (dispatch, commands, render) is a plugin's contribution, not a framework primitive. *2026-04-22*
- [x] **D2** — Plugins use `with*(app)` Slate-style: capture prev via closure, override, mutate in place, return app typed as `app & HasX`. Never respread. *2026-04-22*
- [x] **D3** — Composition = `pipe(seed, ...plugins)`. Pipe order is layer order. Cross-plugin deps enforced at compile via intersection constraints (`<A extends HasX>`). *2026-04-22*

### State & Reactivity

- [x] **D4** — Signals (alien-signals) are the primary state layer. *2026-04-22*
- [x] **D5** — Providers are external data sources, orthogonal to plugins. Shape: `{ state, events?, [Symbol.dispose] }`. *2026-04-22*

### Commands & Discoverability

- [x] **D6** — Commands are object references, not strings. `app.commands.task.toggle_done` is a value; strings exist only for serialization (CLI, MCP, keymap config). *2026-04-22*
- [x] **D7** — Commands are nested object references: `app.commands.domain.action`. Each plugin contributes to a domain namespace. Serialization at boundaries (CLI, MCP, config) uses path strings. *2026-04-22*
- [x] **D8** — Layer-by-layer legibility: each plugin understandable in isolation. No role lanes, no shared-string op unions. *2026-04-22*

### Rendering & Output

- [x] **D9** — Era2a (rendering: `withAg`, `withTerm`, `withReact`) is out of scope here. This doc is era2b (app architecture). *2026-04-22*

### Input & Dispatch

- [x] **D10** — Input seam is unified `dispatch(event: Event)` with discriminated union. All user interactions (key, mouse, paste, focus, resize) are events. Enables event sourcing, replay, undo, AI automation. *2026-04-22*

### Effects & Side Effects

- [x] **D11** — Effects are queued and executed via a dedicated plugin: `withEffects()`. Commands invoke cleanly (no tuple returns). Effects can be mocked, retried, batched. Flushed after state updates. *2026-04-22*

### Cross-Plugin Composition

- [x] **D12** — Cross-plugin dispatch uses dual approach: direct calls for tight coupling (type-enforced compose order), event dispatch for loose coupling. Direct calls are synchronous and type-safe; dispatch events are replayable and decouple domains. *2026-04-22*

### Command Serialization

- [x] **D13** — Command serialization uses dual registry: in-memory nested tree (app.commands) for type safety, flat CommandRegistry for boundaries. Registry auto-flattens tree, provides pathOf()/commandAt() for config/CLI/MCP. *2026-04-22*

### Arguments & Validation

- [x] **D14** — Args schema is dual (pragmatic): pure TS types for simple commands, optional Zod/Standard Schema attached for CLI/YAML/MCP validation. Registry holds schema for boundary validation. *2026-04-22*

### Keybindings

- [x] **D15** — Keymap is a separate plugin with mode support. `app.keymaps.{mode}.{key} = command`. Keymaps are mutable and composable; commands are immutable and reusable. Modes enable insert/normal/modal/custom contexts. *2026-04-22*

### Testing & Mocking

- [x] **D16** — Test harness reuses same app pipe, swaps providers. Mock providers (storage, terminal, clock) are passed to app builder. Effects are captured and inspectable. Enables deterministic, isolated testing. *2026-04-22*

---

## Open Questions (Unified Numbering)

### Rendering Modes & Architecture

- [ ] **D17** — Rendering always explicit in the pipe (`withRender({term})`) vs implied/auto-wired.

### State & Models

- [ ] **D18** — Models separate from commands? `app.models.task` (methods + signals) with `app.commands.task` as discoverable wrapper, or collapse into one?

### Advanced Features

- [ ] **D19** — Plugin ordering enforcement beyond type intersection: runtime checks, branded types for "must be outermost," or convention + documentation.
- [ ] **D20** — Multiple keymap modes (vim-style normal/insert, modal dialogs): one keymap per plugin, stacked by context? Conflict resolution?
- [ ] **D21** — Undo granularity: per-command signal snapshots, per-domain, user-opt-in. Where does the "undoable" list live?

### Observability & Debugging

- [ ] **D22** — Observability seam: wrap `invokeCommand` alone (era2b principle) vs both `dispatch` + `invokeCommand`.

### AI & Automation

- [ ] **D23** — AI surface: `{commands, snapshot}` read-only vs `withAgent({gate, llm})` gated. Confirm.

### Lifecycle & Cleanup

- [ ] **D24** — Lifecycle: async dispose, plugin init phases (before/after tree mount), error boundaries.

### Extensibility

- [ ] **D25** — Third-party plugin discovery + versioning. `silvery-plugin-*` convention?

---

## Rollout (when all [x])

1. Propagate into `v15-tea/` siblings (commands.md, signals.md, headless.md) — they become chapters of this.
2. Update `vendor/silvery/docs/` (public-facing).
3. Implement in `vendor/silvery/packages/create/`.
4. Archive drifted code: `runtime/base-app.ts`, `runtime/with-*-chain.ts`, `definePlugin.ts`, `ag-term/plugins/with-*`, `0LD/**/plugin-system-*`.
5. Migrate km-tui plugins.

## Changelog

- **2026-04-22** — Unified numbering: D1-D25 (decided + open questions in same space). Resolved D7, D10-D16 today. 16 locked, 9 open.
- **2026-04-22** — Resolved Q9 (test harness: same pipe, swapped providers). 16 decisions locked, 9 open questions remaining.
- **2026-04-22** — Resolved Q6 (keymap: separate plugin with modes). 15 decisions locked, 10 open questions.
- **2026-04-22** — Resolved Q5 (args schema: dual TS+optional schema). 14 decisions locked, 11 open questions.
- **2026-04-22** — Resolved Q8 (cross-plugin dispatch: direct + event) and Q15 (command serialization: dual registry). 13 decisions locked, 12 open questions.
- **2026-04-22** — Resolved Q1-Q3 (nested commands, unified dispatch, effects queue). Restructured as layer-by-layer design matrix.
- **2026-04-22** — Draft 0. Consolidated from scattered designs. Prototypes moved into `prototypes/`.
