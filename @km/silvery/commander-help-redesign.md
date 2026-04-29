---
id: "@km/silvery/commander-help-redesign"
aliases:
  - km-silvery.commander-help-redesign
  - km-silvery-commander-help-redesign
created_by: Bjørn Stabell
created_at: 2026-04-07T19:14:55Z
owner: bjorn@stabell.org
---

# [ ] @silvery/commander: rethink help rendering (design pass) @km/silvery #task #P4

# @silvery/commander: rethink help rendering (design pass)

## Status

**Design pass needed before any code lands.** This is a placeholder for the broader help-rendering overhaul that has been discussed several times in 2026-04-07's commander session but doesn't have an agreed-upon design yet.

## What's been considered (and the open questions)

### 1. React-based rendering via Silvery components

**Idea**: render help as a React component tree via `renderStringSync(<HelpView cmd={cmd} />)`. Plug into Commander's `configureHelp({ formatHelp })` hook. Replace Commander's text-based help machinery with silvery's flexbox-driven layout.

**Open questions**:
- Should this ship inside `@silvery/commander` (one package, hard React dep) or as a separate `@silvery/commander-react` package (opt-in, no React in core)? Or as a docs-site copy-paste example with no published code at all?
- Does the package called `@silvery/commander` benefit from actually using silvery's React layer, or is type-safe Commander + ANSI colors enough?
- If split into two packages: how do they share the help-section data? Public getter on `cmd.helpSections`? IR walker function? Direct private-field access?

### 2. HelpModel IR

**Idea**: a typed tree (`HelpSection`, `HelpRow`, `HelpTerm`) describing help structure as data. Walked from Commander's command tree by `commanderToHelpModel(cmd)`. Consumed by any renderer (React, text, HTML, markdown, JSON-for-LLM).

**Open questions**:
- Is the IR worth its weight, or do users just walk Commander's existing `Help` class methods (`visibleOptions`, `visibleCommands`, `subcommandTerm`, etc.)? Commander's API already provides structured access.
- If we add `HelpModel`, does it duplicate Commander's data shape? Does it survive Commander upgrades better?
- The IR is mostly useful for non-terminal renderers (HTML, markdown) — but no consumer needs them today. YAGNI argues for skipping.

### 3. `setHelpRenderer((cmd) => string)` vs `configureHelp({ formatHelp })`

**Idea**: introduce a one-arg method `setHelpRenderer` that's shorter and more direct than Commander's existing two-arg `configureHelp({ formatHelp(cmd, helper) })` hook.

**Open questions**:
- The 18-character ergonomic win doesn't justify a new method that fragments the ecosystem (Commander users already know `configureHelp`).
- `setHelpRenderer` would bypass Commander's `Help` class entirely, losing composition with `padWidth`, `subcommandTerm`, etc.
- Inheritance to subcommands has to be hand-implemented (parent-chain walk) vs Commander's existing `_helpConfiguration` propagation.
- **Tentative answer**: don't add it. Use Commander's existing `configureHelp({ formatHelp })`.

### 4. Pluggable `renderItem` components per section

**Idea**: `addHelpSection("Backends:", rows, { renderItem: BackendRow })` where `BackendRow` is a React component that renders each row's term + description. Default `renderItem` handles the auto-detect ($ blocks, command names, flags) logic.

**Open questions**:
- Adds API surface (`renderItem` prop, component contract).
- Couples `addHelpSection` to React even if the default is a plain function.
- Could be solved by users writing their own `formatHelp` that matches on section title — no new API needed.

### 5. Dynamic content (functions returning rows at help-render time)

**Idea**: `addHelpSection("Backends:", () => buildBackendRows())` — the rows function runs when help is requested, giving live data instead of registration-time data.

**Open questions**:
- Solves the `termless backends` UX problem (action prints table; help prints commands; two systems can't interleave).
- Adds API surface to `addHelpSection` (content can now be a function).
- Sync only? Async needs special handling because Commander's `formatHelp` is sync.

### 6. Multi-target rendering

**Idea**: same `HelpModel` IR can render to terminal (silvery), HTML (docs sites), markdown (READMEs), JSON (AI agent introspection). One source of truth, many output targets.

**Open questions**:
- Premature without a second target. Currently only the terminal needs help output.
- Locks the IR design to "no target-specific concerns" — discipline, but constrains the IR.
- Could be a future bead once VitePress integration lands and someone wants to auto-generate docs from a Commander program.

### 7. `<Cmdline>` component in `silvery/ui` and tokenizer extraction

**Idea**: extract the shell command tokenizer (currently inlined in `styleSectionTerm`) into a reusable utility, ship a `<Cmdline>` Silvery component that wraps it.

**Open questions**:
- Where does the tokenizer live? `@silvery/ansi` is wrong (it's not about ANSI). `@silvery/utils` doesn't exist. A new package is overhead. Inline duplication is bad.
- `<Cmdline>` is reusable beyond commander — error messages, blog posts, docs sites, tutorials — but no consumer wants it today.
- **Tentative answer**: defer until a second consumer appears. Keep the tokenizer private inside `@silvery/commander/src/tokenize.ts`.

## Why this is a P4 placeholder

None of the above is urgent. The default text renderer (`commander-text-render`) is the stop-gap that handles 95% of help styling needs. The React/IR/multi-target stories are real but speculative — they need:

1. A second user (someone writing custom help in production) to validate the API
2. A specific use case that today's `configureHelp({ formatHelp })` can't already handle elegantly
3. A `/csw` or `/big` design session before any code lands

When those arrive, this bead becomes the place to coordinate the design work.

## Concrete next step

Wait for one of:

- A user (in km or external) requests rich React-based help and shows what they want
- The text renderer hits a fundamental limit (e.g., needs flexbox layout for multi-column terms)
- VitePress integration lands and we want HTML help output from the same source
- Theme overhaul wants to drive help styling through the full theme system

Until then: leave the default text renderer alone (after `commander-text-render` lands) and don't add new help APIs to `@silvery/commander`.

## Related

- **closed**: `km-silvery.commander-action-native` — single .action() + explicit .actionMerged() (the footgun fix)
- **closed**: `km-silvery.commander-examples` — addExamples() unnecessary
- **closed**: `km-silvery.commander-style-hooks` — Commander 13+ style hook compat moot in new renderer
- **active**: `km-silvery.commander-text-render` — the stop-gap, ships before this design pass
- **orthogonal**: `km-silvery.commander-command-string-args` — input syntax, not output rendering