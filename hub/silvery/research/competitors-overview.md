# Silvery vs the world — competitive overview

_Internal. High-level map. Snapshot 2026-04-15. Points at deep-dive docs for detail._

This is the fast-read index for silvery's competitive landscape. Every claim in here is expanded in a deep-dive doc; see the [`README.md`](./README.md) for the full list. If you're onboarding or making a strategy call, read this page first, then jump into the specific deep-dive.

## The five categories

Silvery competes — or doesn't compete — in five distinct buckets. Keep these separated when reasoning about positioning.

1. **React-on-terminal frameworks (same lane, same language)** — Ink, OpenTUI
2. **Framework-per-language TUI libraries (different language)** — Bubble Tea (Go), Textual (Python), Ratatui (Rust), notcurses (C)
3. **TUI primitive layers (below the framework line)** — blessed/neo-blessed, terminal-kit, reblessed
4. **Terminal emulators and scrollback renderers (adjacent, not framework)** — xterm.js, Ghostty, Kitty, Alacritty, vt100/vterm
5. **Coding-agent UIs that happen to ship TUIs (consumers, not competitors)** — Claude Code, Gemini CLI, opencode, Aider, goose, codex, crush (see [`coding-agent-landscape.md`](./coding-agent-landscape.md))

The interesting competition for silvery is **category 1**. Categories 2-3 are language-adjacent (silvery can't and shouldn't compete with Ratatui for Rust devs). Category 4 is our testing backend, not a rival. Category 5 is where silvery's customers live.

## One-line take on each serious competitor

### React-on-terminal — category 1, the real competition

- **Ink** (`vadimdemedes/ink`) — The legacy incumbent. React + Yoga WASM, ~1.3M weekly downloads, used by Claude Code, Gemini CLI, Shopify CLI, Prisma, Gatsby, Terraform CDK, and almost every TypeScript-based coding agent. Mature, stable, limited. Silvery ships a ~99% test-compatible Ink compat layer. **Deep dive**: public `silvery-vs-ink.md` page.
- **OpenTUI** (`anomalyco/opentui`) — New (July 2025) and serious. TypeScript façade over a native Zig core, uses Yoga for layout, ships React _and_ Solid reconcilers, bundles optional 3D (Three.js/WebGPU), 2D physics (Rapier/Planck), sprites, tree-sitter, markdown, post-processing effects. ~10k stars, ~144k on its flagship user (opencode). Architecturally the closest thing silvery has to a peer. **Deep dives**: [`opentui-vs-silvery.md`](./opentui-vs-silvery.md), [`opentui-opencode.md`](./opentui-opencode.md), [`anomaly-company.md`](./anomaly-company.md).

### Other-framework TUI libraries — category 2, language-bound

- **Bubble Tea** (`charmbracelet/bubbletea`, Go) — Elm architecture (`Model → Update → View`), paired with Lip Gloss for styling. Charmbracelet's whole brand. Powers Glow, Crush, k9s, lazygit, and most beautiful OSS Go TUIs. If silvery had a Go twin, it would be Bubble Tea. Different language, not directly comparable — but **the design sensibility bar** in OSS TUIs. Watch Charmbracelet's releases for ideas.
- **Textual** (`Textualize/textual`, Python) — Async, CSS-styled, declarative, strong docs, decent component library. Closest Python-side analogue to silvery/Ink. Used by Textual's own dashboard tools and a growing Python OSS crowd. Not a direct competitor to silvery (different language ecosystem), but the one to watch if "we need a non-JS/TS TUI" comes up.
- **Ratatui** (Rust, formerly tui-rs) — **Immediate-mode**, no framework host. You redraw the whole UI each frame; the library just gives you widgets and a buffer. Very different paradigm. The Rust TUI default, used by `openai/codex`, `block/goose` (indirectly), `helix`, `gitui`, and many more. Not comparable to silvery on ergonomics, but much stronger on raw perf ceiling.
- **tview / termui / gocui / notcurses** — Older / lower-level / niche. Mentioned for completeness; not strategic concerns.

### Primitive layers — category 3

- **blessed / neo-blessed / reblessed** — Pre-flexbox Node TUI libraries. The Ink-before-Ink era. Still maintained, still used, but not in the same conceptual space as silvery/Ink/OpenTUI — imperative, procedural, not React-like. Occasionally relevant as a reference for terminal protocol edge cases.
- **terminal-kit** — Higher-level Node terminal library (inputs, dialogs, screen buffers). Niche but capable. Not a framework.

Silvery does not compete with these. If a user is choosing between blessed and silvery, they're in the wrong decision.

### Terminal emulators / renderers — category 4

**Not rivals; testing backends and target environments.** Silvery's testing harness (`@silvery/test` + termless) runs ANSI output through `vt100.js`, `xterm.js`, Ghostty, Kitty, Alacritty, WezTerm, libvterm. These are how silvery verifies it renders correctly _across_ terminals — not something silvery competes with. See [`vt100-vterm-roles.md`](../vt100-vterm-roles.md) and the terminal-rendering research doc.

### Coding-agent UIs — category 5

Not framework competition — these are **customers** or **use cases** for a TUI framework. What matters is **which framework each uses**, because that tells us where silvery can land migrations:

- **Ink + React**: Claude Code, Gemini CLI, qwen-code → biggest potential migration target
- **OpenTUI + Solid**: opencode → locked to its in-house framework
- **Bubble Tea + Go**: crush (Charmbracelet) → locked by language
- **Custom Rust TUI**: openai/codex, block/goose, plandex → locked by language
- **Plain CLI / prompt_toolkit**: Aider → not a TUI migration target
- **Web / IDE extensions**: OpenHands, cline, Continue, Roo, Kilo, Devin, Cursor, Windsurf, Zed → different shape entirely

Full detail: [`coding-agent-landscape.md`](./coding-agent-landscape.md).

## Silvery vs the category-1 competitors, at a glance

### Axes that matter

Ranking by tier: ✅ strong, ⚠️ partial, ❌ missing, 🟥 not applicable.

**Framework hosts**

- Ink: React only ✅
- OpenTUI: React + Solid ✅✅
- Silvery: React only ✅ (Solid planned; Svelte/Vue aspirational — see [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md))

**Layout engine**

- Ink: Yoga WASM (async init, Yoga quirks)
- OpenTUI: Yoga WASM (async init, Yoga quirks)
- Silvery: **Flexily** — pure JS, W3C-spec flexbox, sync init, fingerprint caching; Yoga pluggable when needed ✅

**Layout feedback during render**

- Ink: `useBoxMetrics()` post-layout, starts at 0×0 ⚠️
- OpenTUI: `useTerminalDimensions` + imperative measurement ⚠️
- Silvery: `useBoxRect()` — actual dimensions during first render ✅

**Incremental rendering**

- Ink: Line-level diff, full redraw in inline mode by default ⚠️
- OpenTUI: Cell-level diff (native-assisted) ✅
- Silvery: Cell-level dirty-flag tracking, inline and fullscreen, dynamic scrollback graduation ✅

**Hook API breadth (React)**

- Ink: ~12 hooks (useInput, useFocus, useFocusManager, useBoxMetrics, useApp, useStdout, useStderr, usePaste, useAnimation, useIsScreenReaderEnabled, …) ✅
- OpenTUI: **6 hooks** (useKeyboard, useRenderer, useResize, useTerminalDimensions, useTimeline, useEvent) ⚠️
- Silvery: **20+ hooks** (useInput, useBoxRect/useScrollRect/useScreenRect, useFocus/useFocusable/useFocusWithin, useSignal/useAgNode, useModifierKeys, usePaste, useSelection, useAnimation, useCursor, …) ✅✅

**Canonical component library**

- Ink: 6 core + `@inkjs/ui` 13 more = 19 total ⚠️
- OpenTUI: ~20 renderables (Box, Text, Input, Textarea, Select, Slider, ScrollBox, TabSelect, TextTable, Markdown, Code, ASCIIFont, Diff, FrameBuffer, …) — lower-level than silvery's components ⚠️
- Silvery: **45+ components** (VirtualList, Table, TreeView, CommandPalette, ModalDialog, Tabs, SplitView, Toast, Spinner, ProgressBar, SelectList, TextInput, TextArea, Image, Link, Console, …) ✅✅

**Testing infrastructure**

- Ink: `ink-testing-library` — basic ⚠️
- OpenTUI: `test-renderer`, `mock-keys`, `mock-mouse`, `test-recorder`, `manual-clock` — real, capable ✅
- Silvery: `@silvery/test` + **termless** (10+ emulator backends) + AutoLocator (CSS3 selectors) + cell-level color assertions + frame-by-frame replay + property-invariant fuzz + `.tape` recordings + 77-theme capture + **SILVERY_STRICT** replay==incremental + **SILVERY_STRICT_TERMINAL=all** cross-parser equivalence ✅✅✅

**Correctness invariants**

- Ink: None ❌
- OpenTUI: None visible ❌
- Silvery: **SILVERY_STRICT=1/2** (incremental == fresh on every frame), **SILVERY_STRICT_TERMINAL=all** (vt100 + xterm.js + Ghostty cross-parser), property-invariant fuzz, stress fuzz ✅ — this is silvery's deepest moat, nobody else is doing it

**Theme system**

- Ink: Manual chalk styling ❌
- OpenTUI: RGBA + terminal palette ⚠️
- Silvery: 38 palettes, semantic tokens (`$primary`, `$muted`, `$success`, `$error`, `$surfacebg`), typography presets, auto-detect ✅

**Mouse + SGR + drag + scroll + focus + selection + find + copy-mode**

- Ink: None of the above (focus-tab only) ❌
- OpenTUI: SGR mouse, drag, scroll, basic selection, Kitty keyboard ✅
- Silvery: SGR mouse, DOM-style bubbling, drag, scroll, tree-based focus + spatial nav, text selection, `Ctrl+F` find, `Esc,v` copy-mode, OSC 52 clipboard, Kitty keyboard protocol ✅

**Native deps / toolchain**

- Ink: Yoga WASM (46 KB) ⚠️
- OpenTUI: **Yoga WASM + Zig native core** (per-platform `.node` binaries ~MB each) ⚠️⚠️
- Silvery: **Zero native deps**, pure TypeScript, synchronous init ✅

**Peak raw throughput ceiling** (huge frames, extreme workloads)

- Ink: ❌ (slowest — line-level diff, WASM layout)
- OpenTUI: ✅ (Zig draw paths, native buffer manipulation)
- Silvery: ⚠️ (cell-level diff + dirty flags + memo bailouts win on incremental updates; loses on worst-case raw throughput)

**Multi-target rendering (Terminal / Canvas 2D / DOM)**

- Ink: Terminal only ❌
- OpenTUI: Terminal only (web package is early) ❌
- Silvery: Terminal + Canvas 2D + DOM (experimental) ✅

**Scope breadth**

- Ink: Productivity TUIs only
- OpenTUI: Productivity TUIs **+ 3D (Three.js/WebGPU) + 2D physics (Rapier/Planck) + sprites + shaders + post-processing effects + tree-sitter + markdown + ASCII fonts** — "terminal canvas / game engine"
- Silvery: Productivity TUIs, state-machine foundation, multi-target roadmap. **Deliberately narrower** than OpenTUI.

**Flagship user / public traction**

- Ink: Claude Code, Gemini CLI, Shopify CLI, Prisma, Gatsby, Terraform CDK, thousands of CLIs — huge footprint
- OpenTUI: opencode (~144k stars) — single flagship, huge
- Silvery: km (private), working toward public showcase

**Community / ecosystem**

- Ink: ~1.3M weekly npm, 50+ community packages
- OpenTUI: Small but growing — `@opentui-ui/*` dialog/toast, community forks (`@fairyhunter13/*`, `@vybestack/*`, `@phantasy/*`)
- Silvery: None yet — private repo

### The headline positioning

- **Silvery beats Ink on**: everything structural — layout-first rendering, cell-level incremental, scrolling, mouse, focus, selection, find, clipboard, testing, components, themes, typography, W3C flexbox, perf (3-27× on mounted rerender). Silvery _loses_ to Ink on community size and production mileage.
- **Silvery beats OpenTUI on**: declarative component ergonomics, hook API breadth, canonical component library, correctness infrastructure, cross-parser testing, W3C flexbox, zero-toolchain hackability, multi-target roadmap. Silvery _loses_ to OpenTUI on peak raw throughput, framework pluralism (Solid), scope breadth (3D/physics/fx), and public traction.
- **Silvery beats Bubble Tea on**: being JavaScript. (And vice versa — Bubble Tea beats silvery on being Go.) Not really comparable.
- **Silvery beats Textual on**: being JavaScript. Textual owns the Python TUI story; silvery owns (or aims to own) the TypeScript one.
- **Silvery beats Ratatui on**: ergonomics (declarative vs immediate-mode). Ratatui beats silvery on raw perf and Rust-native integration. Different paradigms.

## Recommended reading order for a new team member

1. **This doc** — get the map.
2. [`opentui-vs-silvery.md`](./opentui-vs-silvery.md) — our closest peer, in depth.
3. [`../../silvery/docs/guide/silvery-vs-ink.md`](../../silvery/docs/guide/silvery-vs-ink.md) — the public-facing comparison, for tone/style reference.
4. [`coding-agent-landscape.md`](./coding-agent-landscape.md) — where our customers live.
5. [`anomaly-company.md`](./anomaly-company.md) — the company we're mostly competing with.
6. [`opentui-opencode.md`](./opentui-opencode.md) — specific relationship detail.
7. [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md) — framework-pluralism opportunity.

## Strategic one-page summary

If you only take three things away:

1. **Silvery's moat is correctness infrastructure.** STRICT mode + termless + cross-parser equivalence + property-invariant fuzz — nobody else is doing this, and it's the foundation that lets silvery be aggressive about incremental rendering without drifting. **Lead with it externally.**
2. **Silvery's biggest gap is framework pluralism.** OpenTUI already ships React + Solid. Silvery is React-only. A `@silvery/ag-solid` (and eventually `ag-vue` / `ag-svelte`) is the single highest-leverage move we could make for external adoption. See [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md).
3. **Silvery's biggest opportunity is the Ink migration.** Claude Code (~114k stars) and Gemini CLI (~101k stars) both ship on Ink + React + Yoga — the exact stack silvery is designed to replace, with a 99% Ink-compat layer already in place. A principled "Ink → Silvery migration for coding agents" story is the most valuable public positioning we could build. See [`coding-agent-landscape.md`](./coding-agent-landscape.md).

Keep the comparisons honest — OpenTUI has real strengths we don't have, and Ink has a community we can't match overnight. But on the axes that matter for the apps we're building (km, knowledge workers, complex interactive TUIs where correctness > FPS), silvery is the best tool in the ecosystem. The work is to make that visible.
