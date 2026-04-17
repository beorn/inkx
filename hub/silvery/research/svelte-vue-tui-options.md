# Svelte & Vue TUI framework landscape

_Internal research. Captured 2026-04-15. Verified against npm registry and GitHub._

## TL;DR

If you want to build a terminal UI and your team uses **Svelte** or **Vue**, the options are thin.

- **Svelte**: no production-grade TUI framework exists. There is no `svelte-ink`, no `svelte-tui`, no Svelte bindings for OpenTUI. A few experimental DOM shims and hobby projects exist but nothing you'd ship. The pragmatic answer today is "don't, or bridge to React/Solid via a microfrontend."
- **Vue**: two real options, both second-tier compared to Ink / Silvery / OpenTUI.
  - **@vizejs/fresco** (active, v0.46.x) — Vue 3 TUI framework by `ubugeeei` with native bindings. Small but under real development in the `ubugeeei/vize` monorepo.
  - **vue-termui** (dormant since 2022) — maintained by Eduardo San Martin Morote (Vue core team, `posva`) and `webfansplz` under `vue-terminal/vue-termui`. Architecturally interesting, last npm publish 2022-12-03. Functionally abandoned.

Strategically for silvery: **a `@silvery/ag-svelte` or `@silvery/ag-vue` reconciler would instantly be the best Svelte/Vue TUI option in the world**, because the bar is on the floor. See the OpenTUI doc for why adding a second/third reconciler is a high-leverage move — this is the same argument, amplified, because neither framework has a modern canonical answer today.

## Svelte — no production path

### What exists

- **`svelte-check`** — nothing to do with TUIs; it's a CLI type-checker. Confusingly indexed under "svelte terminal" searches.
- **Community experiments** — you can find `svelte-blessed`-style hacks and a handful of "use Svelte components to render to the terminal" prototypes on GitHub, but none are current, none have notable stars, and none expose anything like the component inventory that Ink, Silvery, or OpenTUI offer.
- **No official Svelte reconciler target for terminals.** Svelte 5 added runes and some renderer flexibility, but the Svelte compiler is still DOM/SSR-focused. Retargeting Svelte at a terminal scene graph is doable in principle (the Svelte compiler already emits a retargetable runtime) but nobody has shipped the glue.

### Why there's no incumbent

Svelte's historical sweet spot is web app UIs where its compile-time reactivity shines against the DOM. Terminal UIs don't have a DOM, and Svelte's community has been smaller than React's for framework experimentation. The motivated person to build `svelte-ink` never showed up the way `vadimdemedes` did for Ink.

### What we'd tell a Svelte team today

1. Accept React or Solid for your TUI — use Ink, Silvery, or OpenTUI.
2. If you can't accept React/Solid, use a language-agnostic TUI: Ratatui (Rust), Textual (Python), Bubble Tea (Go). Pay the language-boundary cost.
3. Don't try to retarget Svelte at a terminal today unless you want to build the framework yourself. If you're going to build it, consider building it as a silvery reconciler (`@silvery/ag-svelte`) so you inherit the pipeline, layout, components, and testing harness — see "Strategic implications" below.

## Vue — two real options, both second-tier

### @vizejs/fresco — currently alive

- **Package**: `@vizejs/fresco@0.46.0` on npm, plus `@vizejs/fresco-native@0.46.0` for native bindings.
- **Description**: "Vue TUI framework - Build terminal UIs with Vue.js"
- **Author**: `ubugeeei` (single maintainer on npm), part of the `ubugeeei/vize` monorepo on GitHub. Homepage: `https://github.com/ubugeeei/vize`.
- **Signals of life**: v0.46.x suggests real iteration, and the split into a native bindings package suggests architectural ambition beyond a toy.
- **Caveats**: single maintainer, small community, not at a 1.0. No known flagship user comparable to Ink → Gatsby/Prisma/Shopify CLI/Claude Code or OpenTUI → opencode. Documentation surface is thin.

**Verdict**: The most credible Vue TUI option in 2026. Not yet in the same league as Ink or OpenTUI for feature depth, testing, or ecosystem — but the only one that's actively maintained.

### vue-termui — dormant

- **Package**: `vue-termui@0.0.19` on npm — **version `0.0.x`**, which tells you everything.
- **Maintainers**: `posva` (Eduardo San Martin Morote — Vue core team, Vue Router / Pinia author) and `webfansplz`.
- **Repo**: `github.com/vue-terminal/vue-termui`. Secondary packages: `vite-plugin-vue-termui`, `create-vue-termui`, `@vue-termui/syntax-highlight`, `@vue-termui/docs`.
- **Activity**: Last npm publish **2022-12-03**. No releases for over three years. Architecturally nontrivial (Vite plugin + scaffolder + docs terminal + syntax highlight) but effectively abandoned.
- **Why it mattered**: built by a Vue core team member, so the reconciler quality is real — this was a serious attempt, not a weekend hack. It just didn't get follow-through, probably because the Vue community didn't pull on it the way React's did for Ink.

**Verdict**: Fine for reference and possibly reviveable, but don't build production on it.

### Other Vue-ish fragments (not recommended)

- **`@wolf-tui/vue@1.5.0`** — "Vue 3 adapter for Wolfie". Wolfie is a small TUI primitive set; the Vue adapter is narrow and not a full framework.
- **`@simon_he/vue-tui@0.0.7`** — toy / very early, single maintainer.
- **`vue-tui-editor@0.0.1`**, **`@snowdreamtech/vue-tui-editor`** — these are Vue wrappers around **TOAST UI Editor** (web), not terminal UIs. The `tui` in the name is a different `tui`. Name collision.

## Framework-agnostic fallbacks (if you can't use React or Solid)

If your team insists on a non-React, non-Solid, non-TS path for the terminal, the realistic choices are language-level:

- **Ratatui** (Rust) — immediate-mode, no framework host. The Rust standard.
- **Bubble Tea** (Go) — Elm architecture, Charmbracelet's framework. Used by Crush, Glow, lazygit, many others.
- **Textual** (Python) — async, CSS-styled, declarative. Closest in spirit to Silvery / Ink on the Python side.
- **tview / termbox2 / notcurses** — lower-level alternatives in Go / C.

None of these are Svelte or Vue. But if the driving reason for "we want Svelte/Vue" is "our team knows this stack," the deeper question is whether you should take a language/framework hit and land on something mature, rather than trying to retarget Svelte/Vue at the terminal yourself.

## Strategic implications for silvery

Silvery is architected as a **framework-agnostic core** (`@silvery/ag`, `@silvery/ag-term`) with a **thin per-framework reconciler** (`@silvery/ag-react`). This means a `@silvery/ag-svelte` or `@silvery/ag-vue` could plug in and instantly inherit:

- The full rendering pipeline (layout → render → output phases, cell-level incremental, dirty tracking).
- Flexily layout (W3C-spec flexbox).
- The canonical component library (45+ components — though these would need per-framework wrappers).
- The SILVERY_STRICT correctness harness and termless cross-parser testing.
- Theme system, 38 palettes, typography presets.
- Terminal protocol coverage (Kitty keyboard, SGR mouse, OSC 8/22/52/66/133, Kitty graphics, Sixel, capability detection).

The state of the landscape means **any competent Svelte or Vue TUI reconciler built on silvery would immediately be the best option in its framework ecosystem**. OpenTUI already ships Solid and React; shipping Svelte + Vue on top of silvery is the obvious leapfrog move if we care about framework pluralism as a differentiator.

### Effort estimate (rough, not a commitment)

- **`@silvery/ag-svelte`** — highest effort because Svelte 5 runes + the compiler need to emit for a non-DOM target. Rough order: 2-6 weeks of focused work to reach "basic components render, props work, reactivity works" + another 4-8 weeks to reach "component library wrappers, tests, docs". Feasible but nontrivial.
- **`@silvery/ag-vue`** — lower effort because Vue 3's custom renderer API (`createRenderer`) is explicitly designed for this. vue-termui already proved it's possible. Rough order: 2-4 weeks for a minimum viable reconciler, 4-6 weeks to ship something real.
- **`@silvery/ag-solid`** — lowest effort and highest immediate competitive value (OpenTUI already has Solid). Do this first.

### Priority order, if we want framework pluralism as a story

1. **`@silvery/ag-solid`** — neutralizes OpenTUI's framework lead, targets the same audience opencode attracts. Highest leverage.
2. **`@silvery/ag-vue`** — fills a real, visible gap where the only alternatives are dormant (`vue-termui`) or tiny (`@vizejs/fresco`). Easier than Svelte.
3. **`@silvery/ag-svelte`** — hardest, but unique: nobody has a credible Svelte TUI at all. Biggest story if it works.

## Sources

- npm registry (`https://registry.npmjs.org/-/v1/search`) — package searches for `svelte terminal`, `svelte-tui`, `svelte ink`, `vue tui`, `vue-termui`, `vue terminal tui`.
- npm metadata for `vue-termui`: repo `vue-terminal/vue-termui`, maintainers `posva` + `webfansplz`, last-modified 2022-12-03.
- npm metadata for `@vizejs/fresco`: repo `ubugeeei/vize`, single maintainer `ubugeeei`, latest 0.46.0.
- `hub/silvery/research/opentui-vs-silvery.md` — strategic framework-pluralism discussion.
- `vendor/silvery/CLAUDE.md` — silvery reconciler architecture (`@silvery/ag` framework-agnostic, `@silvery/ag-react` as the React host).

Re-verify package versions and activity before quoting — the Vue/Svelte TUI space is small enough that one new entrant could change the picture.
