# Silvery vs OpenTUI — internal deep dive

_Internal research doc. Not for publication. Paired with [`opentui-opencode.md`](./opentui-opencode.md) (relationship + strategic framing). Snapshot captured 2026-04-15 against `@opentui/core@0.1.99` and `anomalyco/opentui` HEAD._

## Why this doc exists

Silvery already has a public [`silvery-vs-ink`](../../../silvery/docs/guide/silvery-vs-ink.md) page. Ink is the legacy incumbent — big, stable, limited. OpenTUI is a **new and serious competitor**: it was built by the opencode team (anomalyco / ex-SST) as a purpose-built in-house replacement for opencode's Bubble Tea TUI, released 2025-07-21, and already has a flagship user with ~144k GitHub stars driving inbound interest. Unlike Ink, OpenTUI is architecturally modern and ambitious — native core, multi-framework, Yoga layout, Kitty keyboard, images, mouse, scroll, even 3D and physics via optional deps. It is the closest thing silvery has to a peer.

This doc does for OpenTUI what `silvery-vs-ink.md` does for Ink, with an internal-candor filter. Every claim below was verified against the `@opentui/core@0.1.99` source clone (`/tmp/opentui-analysis/`). Re-verify before quoting publicly.

## Headline

OpenTUI and silvery are the same _shape_ (component tree → scene graph → diffed frame, layout engine, reconciler per framework) with very different bets in every layer. OpenTUI bets on **a native core** (Zig + C ABI + prebuilt `.node` binaries), **Yoga** for layout, **multi-framework** (React + Solid), and **scope breadth** (3D via Three.js/WebGPU, 2D physics via Rapier/Planck, post-processing effects, sprites, shaders, markdown/tree-sitter). Silvery bets on **pure TypeScript**, **Flexily** (in-house W3C-spec flexbox), **React-first declarative components** with a rich hook API, and **correctness infrastructure** (SILVERY_STRICT, termless, replay==incremental, property-invariant fuzz, 77-theme visual capture). OpenTUI's ceiling is higher on throughput and breadth; silvery's ceiling is higher on correctness, testability, DX, and cross-terminal coverage.

OpenTUI has the market lead today. Silvery has the better foundation for the apps we actually want to build (km, knowledge workers, editors, collaborative/undoable state). Both facts are true and should stay true in our external messaging.

## Corrections to first-pass assumptions

Things I got wrong in the initial walkthrough and want to record explicitly, so we don't propagate them:

- **Layout engine**: OpenTUI uses `yoga-layout@3.2.1` (see `packages/core/src/lib/yoga.options.ts`, `packages/core/package.json`). Zig is **not** doing flexbox. Zig handles buffer manipulation, native span feeding, UTF-8 fast paths, draw-text-buffer hot paths, and provides the C ABI. Layout is still Yoga.
- **Scope**: OpenTUI is not "just a TUI library." It carries `three@0.177.0`, `bun-webgpu`, `rapier2d-simd-compat`, and `planck` as **optional dependencies** for 3D and 2D physics, plus `jimp`, `marked`, `diff`, tree-sitter, ASCII fonts, and post-processing effects (glitch/distortion in `post/effects.ts`). It's closer to "native terminal game + productivity runtime." That's a strategic difference worth flagging — OpenTUI is trying to be a full canvas, silvery is focused on productivity UIs.
- **Component count**: OpenTUI ships ~20 renderables, not "primitives only". See `packages/core/src/renderables/` — Box, Text, TextNode, Textarea, Input, Select, Slider, ScrollBox, ScrollBar, TabSelect, TextTable, Markdown, Code, ASCIIFont, Diff, FrameBuffer, LineNumber, EditBuffer, TimeToFirstDraw, Composition/slot system. More than Ink's 6, substantially fewer than silvery's 45+.
- **Testing**: OpenTUI _does_ have a test story. `packages/core/src/testing/` ships `test-renderer`, `mock-keys`, `mock-mouse`, `capture-spans`, `test-recorder`, `manual-clock`, `spy`, and integration tests. It's real. It's just not _as_ aggressive as silvery's STRICT/replay/termless stack, and it has no equivalent to the `SILVERY_STRICT_TERMINAL=all` cross-parser matrix.

## Highlights

The big differences at a glance.

- **Native Zig core** — OpenTUI's buffer, UTF-8, and draw hot paths are Zig compiled to per-platform `.node` binaries (`@opentui/core-{darwin,linux,win32}-{x64,arm64}@0.1.99`), exposed via C ABI. Silvery is pure TypeScript. OpenTUI wins peak throughput; silvery wins portability, debuggability, and zero toolchain burden.
- **Yoga vs Flexily** — OpenTUI uses `yoga-layout@3.2.1` (WASM async init). Silvery uses Flexily, an in-house pure-JS flexbox that follows the **W3C CSS spec** where Yoga diverges (flex-wrap, aspect ratio, `overflow:hidden + flexShrink:0`). Silvery can run Yoga as a pluggable engine if exact parity is needed.
- **Framework hosts** — OpenTUI ships `@opentui/react` _and_ `@opentui/solid` as first-party reconcilers over the same core. Silvery ships only React (`@silvery/ag-react`). This is the single biggest user-facing DX gap: picking silvery means picking React.
- **Declarative components + rich hook API vs imperative renderables + tiny hook API** — Silvery exposes a mature hook surface (`useBoxRect`, `useInput`, `useFocus`, `useFocusable`, `useFocusWithin`, `useSignal`, `useAgNode`, `useScrollRect`, `useScreenRect`, `useSelection`, `useModifierKeys`, `usePaste`, `useAnimation`, `useDeferredValue`, …) so components stay declarative all the way down. OpenTUI React exposes 6 hooks (`useKeyboard`, `useRenderer`, `useResize`, `useTerminalDimensions`, `useTimeline`, `useEvent`) and pushes you toward imperative mutation of `BoxRenderable` / `TextareaRenderable` / `InputRenderable` / `ScrollBoxRenderable` instances. opencode's 18k-LOC TUI is the evidence — they rebuilt dialogs, lists, prompts, command palette, themes from scratch on top of raw renderables. Silvery does that for you.
- **Layout-first rendering** — Silvery's `useBoxRect()` returns real dimensions _during_ the first render pass. OpenTUI exposes `useTerminalDimensions()` + imperative renderable measurement; responsive components either guess or round-trip through effects. Same wall silvery-vs-ink hits, slightly lower.
- **Correctness harness** — Silvery's `SILVERY_STRICT=1/2` verifies incremental == fresh on every frame, `SILVERY_STRICT_TERMINAL=all` cross-checks ANSI output across vt100 / xterm.js / Ghostty, property-invariant and stress fuzz suites live in `tests/features/*.fuzz.tsx`, and `.tape` recordings render to animated GIF/PNG/SVG across 77 themes. OpenTUI has tests and an integration harness; it does not have anything equivalent to STRICT cross-parser equivalence. **This is silvery's deepest moat.**
- **Breadth of scope** — OpenTUI has 3D (Three.js/WebGPU), 2D physics (Rapier/Planck), sprites, shaders, post-processing effects, ASCII fonts, and tree-sitter syntax highlighting. Silvery has none of those and does not want most of them. Different mission.
- **Mature vendor + flagship showcase** — opencode (~144k stars, ~297k TS/TSX LOC, Bun monorepo) is OpenTUI's live production torture test. Silvery's live consumer is km, which is private and has a smaller but deeper surface.

### Where OpenTUI is stronger

- **Framework pluralism** — React + Solid first-party. Anyone who doesn't want React is already served.
- **Raw throughput ceiling** — Native Zig draw paths + buffer manipulation. We have no numbers to cite yet; assume OpenTUI is faster than silvery on huge frames until we benchmark otherwise.
- **Public traction** — `anomalyco/opentui` has ~10.4k GitHub stars (as of 2026-04-15); `anomalyco/opencode` has ~144k. Silvery and km are both private today.
- **Ambition surface** — 3D, physics, post-fx, WebGPU, sprites, shaders. If someone wants to build a game in the terminal, OpenTUI is the answer. (We don't, but the halo matters.)
- **Kitty image protocol + graphics** — OpenTUI has `jimp`, Kitty graphics, and a sprite/texture pipeline. Silvery has its own `<Image>` (Kitty + Sixel + fallback), so this is parity-ish — but OpenTUI does more with images in practice.

### Where silvery is stronger

- **Declarative DX** — Real React components with props, not imperative `new BoxRenderable(renderer, { … })` or reconciler-mediated renderable mutation. Hooks for _everything_, so app code reads like modern React.
- **Canonical component library** — 45+ components (VirtualList, Table, CommandPalette, TreeView, Toast, SplitView, Tabs, ModalDialog, TextArea, SelectList, …) shipped as part of the framework. OpenTUI gives ~20 lower-level renderables; opencode rebuilds the UI layer on top.
- **Correctness infrastructure** — STRICT mode, replay==incremental, cross-parser terminal matrix, property-invariant fuzz, per-node dirty tracking with invariant checks. None of the OpenTUI competitors come close.
- **Testing ergonomics** — `@silvery/test` + termless + AutoLocator (CSS3 selectors) + cell-level color assertions + frame-by-frame replay + Playwright-style APIs. OpenTUI has a capable test-renderer but nothing like AutoLocator or cross-parser STRICT.
- **W3C-spec layout** — Flexily matches browsers where Yoga doesn't (flex-wrap, aspect ratio, `overflow:hidden + flexShrink:0`). Apps written against CSS intuition behave as expected. Yoga is pluggable when exact Ink/OpenTUI parity is required.
- **State-machine foundation** — `@silvery/create` `pipe()` composition + `@silvery/headless` pure machines + km's `@km/commands` `(action, state) → [state, effects]` architecture. The whole system is replayable and serializable, which is the foundation for undo, collaboration, AI automation, and portability to non-terminal targets (Canvas/DOM). OpenTUI + Solid gives fine-grained reactive mutation; the replay/serialization story is absent.
- **Hackability** — Silvery is git-submodule pure TypeScript. A bug fixes in the same edit-compile loop as km. OpenTUI bugs go through a Zig build, C ABI, `bun run build:native`, and a `.node` binary release cycle. When you're 10 commits deep in a hot debug session, that difference is enormous.
- **Zero native deps** — Silvery installs synchronously with no WASM, no `.node` binaries, no platform-specific artifacts. Matters for CI, Docker, ARM Linux servers, weird BSDs, and anywhere `bun install` is expected to Just Work.
- **Multi-target roadmap** — Silvery already renders to Canvas 2D and (experimentally) DOM from the same component tree. OpenTUI is terminal-first; the `packages/web/` directory exists but is much less developed than silvery's web story.

### What's the same

React host, flexbox layout (Yoga or a Yoga-compatible engine), Box / Text primitives, keyboard parsing with Kitty keyboard protocol, SGR mouse, bracketed paste, synchronized output (DEC 2026), alternate screen, scroll containers, text selection, clipboard (OSC 52), animation timelines, native scroll acceleration on macOS, terminal capability detection, tree-sitter-backed styled text, markdown rendering, image rendering (Kitty graphics), test recorder / headless renderer.

## Feature matrix

Listed OpenTUI first, Silvery second. Features under "Silvery" are built into the framework except where noted.

### Rendering

| Feature                           | OpenTUI 0.1.99                                                                                                                      | Silvery                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Core language**                 | TypeScript façade over **native Zig core** (C ABI, prebuilt `.node` per platform: `@opentui/core-{darwin,linux,win32}-{x64,arm64}`) | Pure TypeScript, zero native deps                                                                        |
| **Buffer**                        | Zig-backed `OptimizedBuffer` with native span feed and UTF-8 fast paths                                                             | TypeScript `TerminalBuffer` + `createTextFrame()` immutable snapshot                                     |
| **Incremental diff**              | Cell-level diff (`Diff.ts` in renderables, native-assisted)                                                                         | Cell-level dirty tracking (7 flags/node), cell-level buffer diff                                         |
| **Inline vs fullscreen**          | Supported; distinct code paths                                                                                                      | Blurred boundary — inline gets fullscreen-level incremental; fullscreen gets inline-level history access |
| **Dynamic scrollback**            | App-managed                                                                                                                         | Items graduate to native terminal scrollback automatically; Cmd+F works                                  |
| **Render targets**                | Terminal only (`packages/web` is early)                                                                                             | Terminal, Canvas 2D, DOM (experimental) — same component tree                                            |
| **Layout feedback during render** | `useTerminalDimensions()` + imperative renderable measurement; no React-level `useBoxRect` analogue                                 | `useBoxRect()` returns real size during first render pass                                                |
| **Post-processing effects**       | `DistortionEffect`, glitch/color filters (`packages/core/src/post/`)                                                                | None                                                                                                     |
| **3D / WebGPU**                   | Optional: `three@0.177.0`, `bun-webgpu`, sprite/texture/shader pipeline (`packages/core/src/3d/`)                                   | None (out of scope)                                                                                      |
| **2D physics**                    | Optional: `rapier2d-simd-compat`, `planck`                                                                                          | None                                                                                                     |

### Performance & size

| Metric               | OpenTUI 0.1.99                                                                                                                 | Silvery                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Hot paths**        | Native Zig: buffer draw, UTF-8, native span feed, text-buffer coordinates                                                      | Pure JS: fingerprint-cached layout, dirty-flag incremental pipeline         |
| **Layout engine**    | `yoga-layout@3.2.1` (WASM, async init)                                                                                         | Flexily (pure JS, ~2 KB, sync) — or Yoga as pluggable engine                |
| **Bundle size**      | Large — Yoga WASM + Zig `.node` binaries per platform; native core alone is multiple MB per platform                           | `silvery/runtime` ~115 KB gzipped (core + Flexily); at parity with Ink+Yoga |
| **Memory**           | Zig-controlled where native, JS GC where not                                                                                   | Normal JS GC; graduated scrollback frees React tree                         |
| **Initialization**   | Async (WASM + native binary load)                                                                                              | Synchronous import                                                          |
| **Benchmarks**       | Native benchmarks shipped (`zig build bench`, `bench:box-draw`, `bench:text-table`, `bench:ts`) — no public numbers vs silvery | `silvery-vs-ink.bench.ts` shows 3-27× vs Ink; no OpenTUI comparison yet     |
| **Native toolchain** | Zig required to build from source; bun-ffi-structs at runtime                                                                  | None                                                                        |

Silvery does not have numbers to quote against OpenTUI. **Action**: add an OpenTUI column to `vendor/silvery/benchmarks/silvery-vs-ink.bench.ts` — treat this as a standing gap.

### Interaction

| Feature                               | OpenTUI 0.1.99                                                                                     | Silvery                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Mouse + drag**                      | `parse.mouse.ts`, SGR mouse, `MouseEvent`, `MouseButton`, drag events                              | SGR mouse, `onClick`/`onWheel`, hit testing, drag, DOM-style bubbling                                               |
| **Scroll acceleration**               | `MacOSScrollAccel`, `ScrollAcceleration` (macOS momentum scrolling)                                | Built-in macOS scroll acceleration                                                                                  |
| **Input layering**                    | `KeyHandler` with `stopPropagation` tests, tree-based bubbling                                     | DOM-style bubbling, modal isolation, input layer providers                                                          |
| **Focus system**                      | None in React bindings (no `useFocus`); imperative on renderables                                  | Tree-based focus: scopes, spatial nav, click-to-focus, `useFocusWithin`, DOM-style focus/blur, `withFocus()` plugin |
| **TextInput / Textarea**              | `Input`, `Textarea`, `EditBufferRenderable` with extmarks (Neovim-style mark system), edit history | `TextInput` / `TextArea` — readline keybindings, selection, undo/redo, cursor                                       |
| **Text selection + find + copy mode** | Selection buffer tests on `Text`; capture-spans test; basic selection                              | Mouse drag selection, `Ctrl+F` find, `Esc,v` keyboard copy mode                                                     |
| **Clipboard**                         | `clipboard.ts` (OSC 52)                                                                            | OSC 52 — works across SSH                                                                                           |
| **Command + keybinding system**       | `keymapping.ts`, `KeyBinding` type — lower-level key-to-action wiring                              | Named commands via `@silvery/commands`, context-aware, `parseHotkey("⌘K")`, serializable                            |
| **Paste handling**                    | `parse.keypress-kitty.ts`, `paste.ts`, `PasteEvent`, `decodePasteBytes`                            | `usePaste`, bracketed paste mode, auto-enable                                                                       |
| **Image rendering**                   | `jimp` + Kitty graphics + sprite/texture system (3D module)                                        | `<Image>` — Kitty graphics + Sixel + text fallback                                                                  |
| **Hyperlinks**                        | OSC 8 via `detect-links.ts`                                                                        | `<Link>` — OSC 8 clickable URLs, Cmd-click support via `useModifierKeys`                                            |
| **Tree-sitter syntax highlighting**   | Built-in, `tree-sitter-styled-text.ts`                                                             | Available via silvery's styled-text layer                                                                           |
| **Markdown**                          | `Markdown.ts` renderable + `marked@17.0.1`                                                         | Available via km-markdown and silvery's Text primitives                                                             |

### Components & framework

| Feature                      | OpenTUI 0.1.99                                                                                                                                                                                                   | Silvery                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework hosts**          | React + Solid (first-party)                                                                                                                                                                                      | React only                                                                                                                                                                                     |
| **Reconciler**               | `react-reconciler@0.32.0` for React, custom Solid reconciler                                                                                                                                                     | `@silvery/ag-react` on `react-reconciler`                                                                                                                                                      |
| **Renderables / components** | ~20 low-level: Box, Text, TextNode, Textarea, Input, Select, Slider, ScrollBox, ScrollBar, TabSelect, TextTable, Markdown, Code, ASCIIFont, Diff, FrameBuffer, LineNumber, EditBufferRenderable, TimeToFirstDraw | 45+ higher-level: Box, Text, SelectList, TextInput, TextArea, VirtualList, Table, TreeView, Tabs, SplitView, ModalDialog, CommandPalette, Toast, Spinner, ProgressBar, Image, Link, Console, … |
| **Component ecosystem**      | Nascent: `@opentui-ui/dialog`, `@opentui-ui/toast`, `opentui-spinner`, community forks (`@fairyhunter13/*`, `@vybestack/*`, `@phantasy/*`)                                                                       | In-repo canonical components; no external ecosystem                                                                                                                                            |
| **Plugin system**            | `packages/core/src/plugins/` — core-slot, registry, plugin types; per-framework plugins in `react/plugins`, `solid/plugins`                                                                                      | `pipe()` + `withReact / withTerminal / withFocus / withDomEvents / withCommands / …`                                                                                                           |
| **Slot / composition API**   | `createSlot`, `createSolidSlotRegistry`, `SolidPlugin`                                                                                                                                                           | React composition + `<Console />` / `<Portal />` / focus scopes                                                                                                                                |
| **Theme system**             | App-level RGBA, hex colors, per-component styling, `terminal-palette.ts`                                                                                                                                         | 38 palettes, semantic tokens (`$primary`, `$muted`, `$success`, `$error`, `$surfacebg`, …), typography presets (`H1/H2/H3/Muted/Small/Code`), auto-detect                                      |
| **Animation**                | `Timeline.ts`, `useTimeline`, frame-delta animation                                                                                                                                                              | `useAnimation` + easing functions + `useAnimatedTransition`                                                                                                                                    |
| **Accessibility**            | None visible                                                                                                                                                                                                     | Basic support                                                                                                                                                                                  |
| **Resource cleanup**         | Explicit dispose / reconciler teardown                                                                                                                                                                           | `using` / Disposable + explicit teardown                                                                                                                                                       |
| **TEA state machines**       | None                                                                                                                                                                                                             | `@silvery/create` + `@silvery/headless`: `(action, state) → [state, effects]`, replay, undo                                                                                                    |

### React hook surface

One of the bigger practical deltas. Hooks exposed from the React bindings:

**OpenTUI React** (`packages/react/src/hooks/`):

- `useEvent`, `useKeyboard`, `useRenderer`, `useResize`, `useTerminalDimensions`, `useTimeline`

**Silvery** (`@silvery/ag-react/hooks/` + barrel):

- `useInput`, `useFocus`, `useFocusable`, `useFocusWithin`, `useModifierKeys`, `usePaste`, `useBoxRect`, `useScrollRect`, `useScreenRect`, `useSignal`, `useAgNode`, `useSelection`, `useAnimation`, `useAnimatedTransition`, `useWindowSize`, `useDeferredValue`, `useCursor`, plus the runtime `useInput`.

OpenTUI's 6 hooks push applications toward imperative mutation on `*Renderable` handles. Silvery's richer surface lets applications stay declarative. This is the single clearest reason opencode's TUI is 18k LOC of manual renderable wiring — the hook API makes you do it.

### Testing

| Feature                             | OpenTUI 0.1.99                                                   | Silvery                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test renderer**                   | `packages/core/src/testing/test-renderer.ts` — headless render   | `createRenderer` (fast virtual buffer) + `createTermless` (full ANSI pipeline)                                                                                          |
| **Mock input**                      | `mock-keys.ts`, `mock-mouse.ts`, `manual-clock.ts`, `spy.ts`     | `app.press()`, `app.type()`, `app.mouse.*`, AutoLocator, deterministic clock                                                                                            |
| **Recording**                       | `test-recorder.ts`, `capture-spans.test.ts`, integration.test.ts | `.tape` recordings → animated GIF / PNG / SVG with 77 themes and window chrome                                                                                          |
| **Real terminal emulator in tests** | None visible                                                     | `createTermless()` + Termless backends: xterm.js, vt100, libvterm, Ghostty, Kitty, Alacritty, WezTerm                                                                   |
| **Cross-parser invariants**         | None                                                             | `SILVERY_STRICT_TERMINAL=all` verifies ANSI output against vt100, xterm.js, Ghostty                                                                                     |
| **Render invariant checks**         | None visible                                                     | `SILVERY_STRICT=1/2` verifies incremental == fresh on every frame; `SILVERY_STRICT_ACCUMULATE=1` full replay                                                            |
| **CSS selector locators**           | None                                                             | AutoLocator: CSS3 via css-select — `#id`, `[attr=…]`, combinators, pseudo-classes, `:has`, `:nth-child`, `:not`, narrowing via `getByText`, `filter`, `first`, `nth`, … |
| **Cell-level assertions**           | Snapshot-based                                                   | `app.cell(col,row)` → resolved RGB colors, bold, dim, underline, wide-char, hyperlink                                                                                   |
| **Frame-by-frame replay**           | Via test-recorder                                                | `handle.frames` (ANSI strings per render), `.tape` executor                                                                                                             |
| **Property-invariant fuzz**         | None visible                                                     | `tests/features/property-invariants.fuzz.tsx` (7 invariants) + `incremental-rendering.fuzz.tsx` stress suite                                                            |

OpenTUI has a respectable unit-test infrastructure; silvery has a **correctness-engineering** infrastructure. For a TUI framework where bugs are often "this one terminal renders incrementally differently from fresh," that distinction is the whole ballgame.

### API & DX

| Feature                | OpenTUI 0.1.99                                                                                                                | Silvery                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Simple entry point** | `const renderer = await createCliRenderer(); render(<App/>, renderer)` — async, renderer first                                | `await run(<App />)` (runtime) or `render(<App />, term)` (bare)                                      |
| **Composition API**    | Plugin registry + slots; `pipe`-style not idiomatic                                                                           | `pipe(createApp, withReact, withTerminal, withFocus, withDomEvents)`                                  |
| **React DevTools**     | Standard react-reconciler support                                                                                             | Supported + `SILVERY_DEV=1` inspector (tree, dirty flags, focus path)                                 |
| **Unicode utilities**  | Internal (`styled-text.ts`, `TextNode`, `TextTable`)                                                                          | 28+ built-in functions: grapheme split, display width, CJK, ANSI-aware truncation                     |
| **Console capture**    | N/A                                                                                                                           | `<Console />` composable component                                                                    |
| **Non-TTY detection**  | App-level                                                                                                                     | `isTTY()`, `resolveNonTTYMode()`, `renderString()` fallback                                           |
| **Documentation**      | `packages/core/docs/`: getting-started, development, tree-sitter, renderables-vs-constructs, env-vars. Functional but sparse. | `silvery.dev` VitePress site + The Silvery Way guide + Styling guide + debugging guide + compat guide |
| **License**            | MIT                                                                                                                           | MIT                                                                                                   |

## Terminal protocol coverage

Protocols verified in the OpenTUI clone (`packages/core/src/lib/`).

### Keyboard & input

| Protocol           | What                                                                    | OpenTUI | Silvery                           |
| ------------------ | ----------------------------------------------------------------------- | ------- | --------------------------------- |
| Kitty keyboard     | `parse.keypress-kitty.ts` + `.protocol.test.ts` — all flags             | Full    | Full                              |
| Modifier detection | Shift, Alt, Ctrl, Super/Cmd                                             | Full    | Full + Hyper, CapsLock, NumLock   |
| Key event types    | Press + release + repeat                                                | Full    | Full                              |
| Bracketed paste    | `parse.keypress-kitty.ts`, `paste.ts`, `decodePasteBytes`, `PasteEvent` | Full    | `usePaste` hook + bracketed paste |
| Focus reporting    | Reported via renderer events                                            | Partial | Full                              |

### Mouse

| Protocol              | What                                          | OpenTUI | Silvery |
| --------------------- | --------------------------------------------- | ------- | ------- |
| SGR mouse (1006)      | `parse.mouse.ts`, `MouseEvent`, `MouseButton` | Yes     | Yes     |
| Drag                  | Yes                                           | Yes     |
| Wheel                 | Yes                                           | Yes     |
| macOS scroll momentum | `scroll-acceleration.ts`, `MacOSScrollAccel`  | Yes     | Yes     |
| Cursor shape (OSC 22) | Unclear                                       | —       | Yes     |

### DEC modes and output

| Mode           | What                | OpenTUI                                      | Silvery |
| -------------- | ------------------- | -------------------------------------------- | ------- |
| 25 (DECTCEM)   | Cursor visibility   | Yes                                          | Yes     |
| 1000/1002/1006 | Mouse tracking      | Yes (1006)                                   | Yes     |
| 1004           | Focus reporting     | Partial                                      | Yes     |
| 1049           | Alternate screen    | Yes                                          | Yes     |
| 2004           | Bracketed paste     | Yes                                          | Yes     |
| 2026           | Synchronized output | Likely yes (opencode relies on flicker-free) | Yes     |

### OSC sequences

| OSC | What                    | OpenTUI                 | Silvery |
| --- | ----------------------- | ----------------------- | ------- |
| 0/2 | Window title            | Partial                 | Yes     |
| 8   | Hyperlinks              | Yes (`detect-links.ts`) | Yes     |
| 22  | Mouse cursor shape      | —                       | Yes     |
| 52  | Clipboard over SSH      | Yes (`clipboard.ts`)    | Yes     |
| 66  | Kitty text sizing       | —                       | Yes     |
| 133 | Semantic prompt markers | —                       | Yes     |

### Graphics

| Protocol               | What                       | OpenTUI                          | Silvery |
| ---------------------- | -------------------------- | -------------------------------- | ------- |
| Kitty graphics         | PNG transmission, chunking | Yes (+ 3D sprite/texture system) | Yes     |
| Sixel                  | RGBA-to-Sixel encoder      | —                                | Yes     |
| Auto-detect / fallback | Try Kitty → Sixel → text   | Partial                          | Yes     |

### Terminal queries

OpenTUI has `terminal-capability-detection.ts` and `terminal-palette.ts` for capability probing. Silvery does CPR (DSR 6), CSI 14t / 18t, DA1/DA2/DA3, XTVERSION at startup. Comparable intent; silvery's cross-parser verification (`SILVERY_STRICT_TERMINAL=all`) is the differentiator.

## Key architectural differences explained

### 1. Imperative renderables vs declarative components

OpenTUI's React host is a thin reconciler over imperative `*Renderable` objects. A component doesn't describe output; it describes a renderable to construct and then mutates it via signals or effects. This shows up clearly in opencode's TUI:

```tsx
// OpenTUI-style (reconstructed from opencode patterns)
function MyBox() {
  const renderer = useRenderer()
  const box = useMemo(() => new BoxRenderable(renderer, { id: "my", width: 10 }), [renderer])
  useEffect(() => {
    box.width = computedWidth
  }, [computedWidth])
  return <boxRenderable ref={box}>...</boxRenderable>
}
```

Silvery looks like web React:

```tsx
function MyBox() {
  const { width } = useBoxRect()
  return (
    <Box width={width}>
      <Text>...</Text>
    </Box>
  )
}
```

The OpenTUI style has ceiling benefits (signals mutate renderables directly, no VDOM pressure) but it pushes _every_ component toward hand-wiring. That's why opencode had to build its own dialog, command palette, list widget, prompt, theme system from scratch on top of raw renderables — and ships 18k LOC of TUI code to do it. Silvery's declarative React-with-hooks model is what makes it reasonable to ship 45+ canonical components in the framework itself.

### 2. Layout feedback during render

Silvery's single biggest architectural win. `useBoxRect()` returns real dimensions _during_ the first render pass — the layout phase runs first, and components read their computed rect. OpenTUI exposes `useTerminalDimensions()` (outer terminal size) and imperative measurement on renderables after layout, so responsive sub-components (columns that adapt to column width, cards that truncate to card width) are either guess-and-rerender or effect-driven. Same wall Ink's `useBoxMetrics()` hits. For km specifically — where a card inside a column inside a board has to know its width _now_ to truncate a title — this is the difference between one render pass and N nested measure-then-render rounds.

### 3. Correctness harness vs happy-path tests

Both have tests. OpenTUI's are snapshot- and integration-oriented. Silvery's are **invariant-oriented**. When SILVERY*STRICT is on, every single render diffs `incremental → current state` against `fresh → current state` and fails if the cell-level buffers disagree. When `SILVERY_STRICT_TERMINAL=all`, the same ANSI output is re-parsed through vt100, xterm.js, \_and* Ghostty, and the resulting cell grids must agree. Fuzz suites run property invariants (idempotence, no-op, inverse ops, viewport clipping, combined). This catches a class of bug — "the incremental fast path drifts from the fresh path after op sequence X" — that snapshot tests never will, and that's exactly the class of bug that tanks complex interactive TUIs.

Silvery having the harness is not a side project. It's the entire reason the pipeline can be aggressive with dirty flags, cache layout subtrees, graduate scrollback dynamically, and stay correct. **Any internal positioning should lead with this.**

### 4. W3C-spec flexbox vs Yoga quirks

Both Ink and OpenTUI use Yoga. Yoga has well-known divergences from the W3C CSS Flexbox spec:

- Default `flexDirection` is `column` (spec: `row`). OpenTUI inherits this.
- `overflow: hidden` + `flexShrink: 0` expands to content size instead of shrinking to parent — content can overflow clipping.
- `alignContent` distribution differs from browser behavior on secondary axes.

Flexily fixes these to match browsers. For a team of web-first developers (us), that means fewer "why is this rendering wrong, my CSS brain says X" moments. For a team that already knows Yoga, it means occasional porting friction — which is why silvery keeps Yoga as a pluggable engine.

### 5. Native core vs pure JS

This is the trade that will most visibly go against silvery on a benchmark chart. Zig will beat JS on draw-text and buffer-manipulation hot paths, probably by a real factor, once frames get large. What silvery buys with pure JS:

- **No toolchain** — no Zig, no `bun run build:native`, no per-platform binary packaging, no `.node` loader.
- **No release-cycle penalty** — bugs in hot paths fix in the same edit-save loop as app code.
- **No binary supply chain** — no platform-specific packages to vet, sign, rebuild.
- **Works everywhere bun/node works** — including ARM Linux servers, random BSD boxes, Docker images too small for native, and CI environments that don't allow downloading binaries.
- **Full source-level debugging** — regular stack traces, regular profilers, no FFI gap.
- **Introspectable** — silvery's pipeline can be instrumented, stepped through, and visualized with plain JS tooling. Zig hot paths can't.

The correct internal stance is: **silvery is slower than OpenTUI on extreme throughput and that is a deliberate trade**. When the trade stops being worth it for some workload, we'll optimize with WASM or worker threads — _not_ native binaries, because the binary supply chain is exactly what we're avoiding.

### 6. Scope

OpenTUI is trying to be a **full terminal canvas** — productivity UIs, yes, but also terminal games (via Three.js/WebGPU/Rapier/Planck), post-processing effects (glitch, distortion, color filters), sprites, shaders, ASCII fonts at scale. Silvery is focused on **productivity TUIs** — knowledge workers, editors, dashboards, CLIs, agents. Different missions, and both are legitimate. When comparing, don't let OpenTUI's breadth make silvery look narrower than it is — narrow is a feature when it means "every line of code serves apps like km and not apps that don't exist yet."

## Layout engines — concrete comparison

|                                    | Flexily                                | Yoga (OpenTUI + Ink)                       |
| ---------------------------------- | -------------------------------------- | ------------------------------------------ |
| Size (gzip)                        | ~19 KB pure JS                         | ~53 KB WASM (+ loader)                     |
| Language                           | TypeScript                             | C++ → WASM (OpenTUI adds a Zig C-ABI host) |
| Initialization                     | Synchronous                            | Async                                      |
| Default `flexDirection`            | `row` (CSS spec)                       | `column` (Yoga default)                    |
| `overflow:hidden` + `flexShrink:0` | Item shrinks to fit (CSS §4.5)         | Item expands to content                    |
| `alignContent`                     | Browser-matching                       | Minor divergence                           |
| Fingerprint caching                | Yes                                    | No                                         |
| Pluggable?                         | Yes — `SILVERY_ENGINE=yoga` falls back | OpenTUI locks to Yoga                      |

Both benchmark in the same ballpark on typical trees (100-node kanban: Flexily 85 μs, Yoga 88 μs in silvery's own benchmarks). Flexily's advantage is spec compliance, sync init, fingerprint caching, zero WASM loader, and being hackable from the same repo.

## When to choose what (internal framing)

This is for our own messaging — we don't want to be dismissive in public.

### A team should pick OpenTUI when…

- They need Solid instead of React.
- They want to build a terminal game, sprite-based UI, 3D overlay, or anything post-processing.
- They need the very highest raw throughput on huge frames and the Zig core's draw paths matter.
- They're already in the opencode ecosystem and inheriting the playbook.
- They're comfortable running a native binary supply chain and building from Zig when needed.
- They want a very large flagship user (opencode) as social proof.

### A team should pick Silvery when…

- They're building an interactive productivity TUI: editor, dashboard, agent, kanban, knowledge tool, task/notes app, CLI with rich interactions.
- They need layout-aware rendering (`useBoxRect` during render) and declarative React components with rich hooks.
- Correctness matters more than FPS: incremental == fresh cross-parser invariants, replay, deterministic testing.
- They want a canonical component library bundled into the framework (45+ components) instead of rebuilding dialogs and lists.
- They want spec-compliant flexbox and the option to run plain browser CSS mental models.
- They care about multi-target rendering (Terminal, Canvas 2D, DOM) from the same component tree.
- They want pure TypeScript, zero native deps, synchronous init, and a hackable-from-the-same-repo workflow.
- They want a state-machine foundation for undo, replay, collaboration, and AI automation.

## Real-world scenarios

### Kanban / knowledge board (km)

Many columns, many cards, each card wraps its title based on live column width, keyboard and mouse navigation, sub-millisecond updates on every keystroke, scrollable columns, find, selection.

- **OpenTUI**: Manual renderable wiring per column and card. Width threading through props or signals. `overflow:hidden + flexShrink:0` Yoga quirk bites unless you work around it. Scroll container works but measurement for truncation is post-layout. Correctness guarantees rely on snapshot tests. Perf ceiling is high (Zig draw paths).
- **Silvery**: `useBoxRect()` gives each card its width during render; truncation is one expression. `overflow="scroll"` on columns just works. STRICT mode catches incremental cascade bugs the moment they happen. 45+ canonical components cover cards, find, selection, modal, toast.

### Terminal game / 3D scene / sprite animation

- **OpenTUI**: Strong. Three.js, WebGPU, sprites, shaders, post-fx are all built in.
- **Silvery**: Not the target. Possible with custom renderables, not the happy path.

### Chat / coding agent UI (opencode-shaped)

Prompt input, response streaming, command palette, session list, dialog stack, status bar, theme switching, model picker.

- **OpenTUI**: What opencode uses. Works, but the 18k-LOC TUI is mostly hand-rolled components — dialogs, selects, command palette, theme list, input box, session list. Feasible because Solid signals + imperative renderables give them full control.
- **Silvery**: Would ship faster. `CommandPalette`, `SelectList`, `TextInput`, `ModalDialog`, `Tabs`, `TextArea`, `Spinner`, `Toast`, `Link` are all built-in. Semantic theme tokens + 38 palettes remove theme-plumbing entirely.

### CLI prompt / one-shot tool

- **OpenTUI**: Overkill — you pay for Zig binaries + Yoga + Solid/React for a single prompt.
- **Silvery**: Small entry point (`run(<App />)`) but still heavier than Ink for true one-shots. Ink remains strongest here.

### Dashboard with resizable panes

- **OpenTUI**: Imperative width measurement post-layout; each pane re-renders on resize.
- **Silvery**: Each pane reads `useBoxRect()` and adapts immediately. Resize triggers a layout-only pass.

## Strategic notes (internal)

Things to do or watch, in no particular order:

1. **Ship `@silvery/ag-solid`.** Neutralizes the "only React" critique, puts silvery in the opencode/solid audience, and costs us one reconciler. The existing reconciler split (`@silvery/ag` = framework-agnostic, `@silvery/ag-react` = React bindings) was designed with this in mind. High leverage, probably medium effort. Tracking: consider a bead like `km-silvery.solid-renderer` if not already filed.
2. **Benchmark against OpenTUI, not just Ink.** Add an OpenTUI column to `vendor/silvery/benchmarks/silvery-vs-ink.bench.ts`. Expect to lose on extreme-throughput scenarios (huge frames, long text tables) and win on incremental update scenarios where dirty flags + memo bailouts shine. Publish honest numbers.
3. **Publish silvery's correctness story externally.** The SILVERY*STRICT / cross-parser / property-invariant fuzz story is our single biggest moat and \_literally nobody else is doing it*. A blog post + a page on silvery.dev explaining how STRICT works and why it matters will do more for silvery's credibility than any feature list. Think of it as our equivalent of "Ratatui is immediate mode" — a one-sentence meme that makes the difference visible.
4. **Own "spec-compliant flexbox" as a story.** Flexily vs Yoga is real and differentiates silvery from _both_ Ink and OpenTUI. Web developers keep asking for this. Write it up.
5. **Track OpenTUI releases.** `anomalyco/opentui`. Features they ship that we don't have are pre-validated feature requests. Features we have and they don't are marketing bullets.
6. **Know the things OpenTUI does that we're not going to chase.** 3D, WebGPU, sprites, physics, post-processing effects are out of scope and should stay out of scope. When someone compares surface area, say so explicitly — "silvery is a productivity TUI framework, not a terminal canvas" — rather than implying we'll catch up.
7. **Showcase gap.** opencode (144k stars) is OpenTUI's public torture test. km is private. Silvery needs _some_ public showcase before it ships broadly. Options: (a) silvery.dev interactive docs rendered through silvery itself, (b) an example app (TODO-style or a small editor) shipped in `vendor/silvery/examples/`, (c) eventually km itself. Treat as strategic homework.
8. **Be careful in benchmarks.** `createCliRenderer` is async and renderer-first; silvery's `run(<App />)` is async but ergonomically simpler. Apples-to-apples benchmarking has to account for setup time, warmup, and rendering path. Borrow silvery-vs-ink's methodology.
9. **Watch the Solid + signals pitch.** OpenTUI's Solid story will resonate with people who think "React is too heavy for a terminal." Our counter is **correctness-first + layout-first + canonical components**, not "React is fine." Don't get pulled into a framework war we don't need.
10. **Don't bet against the Zig core long-term.** If OpenTUI keeps investing in native optimization, the perf gap on huge frames will widen. Plan silvery's eventual answer (WASM-backed buffer ops, worker-thread layout, or staying pure-JS and owning the correctness story forever) as a deliberate architectural choice rather than drifting into it.

## Sources

- Clone of `anomalyco/opentui` at `/tmp/opentui-analysis/` (checked `@opentui/core@0.1.99`).
  - `packages/core/package.json` — deps include `yoga-layout@3.2.1`, `jimp`, `marked`, `diff`, `bun-ffi-structs`; optional deps include `three`, `bun-webgpu`, `rapier2d-simd-compat`, `planck`, and per-platform `@opentui/core-{os}-{arch}`.
  - `packages/core/src/lib/` — `yoga.options.ts`, `parse.keypress-kitty.ts`, `parse.mouse.ts`, `clipboard.ts`, `scroll-acceleration.ts`, `terminal-capability-detection.ts`, `terminal-palette.ts`, `tree-sitter`, `extmarks.ts`, `KeyHandler.ts`.
  - `packages/core/src/renderables/` — 20 renderables enumerated.
  - `packages/core/src/testing/` — `test-renderer`, `mock-keys`, `mock-mouse`, `capture-spans`, `test-recorder`, `manual-clock`.
  - `packages/core/src/3d/`, `packages/core/src/post/` — 3D and post-processing subsystems.
  - `packages/core/src/zig/` — Zig native sources, C ABI, bench suite.
  - `packages/react/src/hooks/` — 6 hooks enumerated.
  - `packages/solid/` — Solid reconciler + elements + plugins.
- Clone of `anomalyco/opencode` at `/tmp/opencode-analysis/` — `packages/opencode/src/cli/cmd/tui/` as the production OpenTUI consumer.
- `vendor/silvery/docs/guide/silvery-vs-ink.md` — structural template and claims to match.
- `vendor/silvery/CLAUDE.md` — canonical feature list for silvery's hooks, tests, themes, components.
- `hub/silvery/research/opentui-opencode.md` — paired strategic framing doc (same capture session).

Re-verify numeric claims (star counts, LOC, version strings) before quoting in public materials. Everything else is architectural and should be stable on short timescales.
