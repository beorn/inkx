# Introducing Silvery: Polished Terminal Apps in React

> **Internal draft. Not published.** Refine before posting.

---

I've been building a terminal application for the past year and a half -- a multi-pane workspace with a kanban board, thousands of nodes, keyboard navigation, mouse support, and inline editing. The kind of app where "just render some colored text" stops being a useful description pretty quickly.

I started with [Ink](https://github.com/vadimdemedes/ink), and it was the right call. Ink proved that React belongs in the terminal. The idea that you could use hooks, components, and flexbox to build a CLI -- that was genuinely important. A lot of the terminal tools we use today exist because Ink made that path credible.

But as my app grew, I kept hitting walls.

## Two problems I couldn't work around

The first was that components couldn't know their own size during render. In Ink, React renders first, then Yoga calculates layout. By the time your component runs, it doesn't know how wide its container is. Ink 7.0 improved this with `useBoxMetrics()`, which provides dimensions after the first layout via `useEffect` -- a real step forward. But the first render still sees `{width: 0, height: 0}`, and nested responsive components each need their own measure-rerender cycle.

The second was performance on updates. When a user presses a key to move a cursor in a 1000-node tree, Ink re-runs React reconciliation and Yoga layout for the entire tree. Ink 7.0 added line-level incremental output, and DEC mode 2026 for synchronized output -- both welcome improvements. But the React and layout passes still walk everything. For my app, that added up to noticeable latency on every keypress.

I needed layout to run _before_ rendering, so components could know their dimensions. And I needed per-node dirty tracking, so only changed nodes would re-render. That required a different rendering pipeline, which meant building a new renderer.

What I didn't expect was how much further the rabbit hole went.

## The ecosystem that grew itself

The renderer needed a layout engine. I started with Yoga, but found myself questioning the WASM tax -- the async initialization, the binary blob, the separate memory heap. What if the layout engine was just TypeScript? So I built [Flexily](https://beorn.codes/flexily), a pure-TypeScript flexbox engine that follows the W3C spec. It turned out to be 2.5x faster than Yoga WASM, with zero native dependencies.

Testing the renderer meant testing against real terminals. I missed Playwright -- that confidence you get from running your app in a real environment and asserting on what the user actually sees. So I built [Termless](https://termless.dev), which runs your terminal app through real parser backends -- xterm.js, vt100, Ghostty, Kitty, Alacritty, WezTerm, and more -- in-process, with Playwright-style locators and `press()` simulation.

But when I started probing terminal capabilities systematically, I hit a surprising gap. Which terminals actually support Kitty keyboard? OSC 52 clipboard? Sixel graphics? Synchronized output? The answers were scattered across source code, GitHub issues, and years of accumulated trial-and-error. So I built [terminfo.dev](https://terminfo.dev) -- an empirical compatibility database covering 161 features across 19 terminals, all probed automatically via Termless.

Inside Silvery itself, the same pattern repeated. The framework needed a theme system that auto-detects terminal colors and adjusts for contrast -- that became [@silvery/theme](https://silvery.dev/themes) with 84 color schemes and semantic design tokens. Testing utilities that feel like the web -- that became [@silvery/test](https://silvery.dev/examples/testing) with Playwright-style locators and buffer assertions. CLI apps needed beautiful help text without a separate rendering layer -- that became [@silvery/commander](https://silvery.dev/reference/commander), which renders its help through Silvery itself. Your CLI looks like your app because it _is_ your app.

It's a little addictive, owning the entire pipeline. Each piece you build reveals the next opportunity. Flexily questioned whether layout needs WASM. Termless questioned whether terminal testing needs a real TTY. terminfo.dev questioned whether terminal compatibility data needs to live in scattered GitHub issues. Each answer opened the next question.

## What Silvery is today

Silvery is a React framework for modern terminal apps. Same `Box`, `Text`, `useInput` API that Ink developers already know. The `@silvery/ink` compatibility layer passes 918 of Ink 7.0's 931 tests -- enough to migrate most apps with an import change.

But under the hood, the architecture is different in ways that matter.

**Layout-first rendering.** Silvery inverts Ink's pipeline: Flexily calculates positions and sizes first, then React renders components with their actual content box available via `useBoxRect()`. No `{width: 0}` on first render. No measurement-rerender cycles. This is what makes `overflow="scroll"`, `position="sticky"`, automatic text truncation, and responsive components possible.

```tsx
function IssueCard({ issue }: { issue: Issue }) {
  const { width } = useBoxRect()
  return width >= 32 ? <FullCard issue={issue} /> : <CompactCard issue={issue} />
}
```

That works on the first paint. No prop drilling, no effects, no flash of wrong content.

**Incremental rendering.** Each node tracks dirty state independently. A typical interactive update -- cursor move in a 1000-node tree -- takes about 169 microseconds. The benchmarks run 16 scenarios; Silvery is faster in all 16, ranging from 3x to 5x on mounted workloads. Run `bun run bench` in the repo to reproduce.

**Pure TypeScript, zero native dependencies.** The entire stack, including the layout engine, is TypeScript with no WASM, no C++ bindings, no platform-specific binaries. It works on Alpine, CI, Docker, everywhere -- `npm install silvery react` and you're running.

**45+ components.** SelectList, TextInput, TextArea, VirtualList, Table, TreeView, CommandPalette, ModalDialog, Tabs, Toast, Spinner, ProgressBar, SplitView, and more. They handle keyboard navigation, mouse events, theming, scrolling, and focus management out of the box. The idea is that you shouldn't have to reimplement readline keybindings or j/k list navigation ever again.

**Terminal protocol support.** 100+ escape sequences, all auto-negotiated: Kitty keyboard, SGR mouse, OSC 8 hyperlinks, OSC 52 clipboard, bracketed paste, focus reporting, synchronized output, semantic prompts. When your terminal supports a feature, Silvery uses it. When it doesn't, Silvery falls back gracefully.

**Focus system.** Scoped focus with arrow-key directional navigation, click-to-focus, Tab/Shift-Tab cycling. Modals automatically consume input -- no guard clauses needed. It's the focus model web developers expect, adapted for how terminals actually work.

**Theming.** 84 color schemes with semantic tokens (`$primary`, `$muted`, `$error`, `$success`) that auto-detect the terminal's background color and adjust for WCAG-compliant contrast. Switch palettes with one line; every component respects the tokens automatically.

**Dynamic scrollback.** This one is hard to explain without seeing it. Silvery's inline mode keeps a live React zone at the bottom of your terminal, while completed items graduate to terminal-owned scrollback above. Cmd+F and text selection work natively on the graduated content. Inline mode gets fullscreen-level performance; fullscreen mode gets inline-level UX. It bridges the gap that most terminal frameworks treat as a hard either/or.

## Terminal apps have grown up

Ink was designed for a world where terminal apps were mostly prompts and progress bars. That world has changed. Today people are building AI coding agents, code review tools, dashboards, note-taking systems, editors, TUI IDEs -- applications with the complexity of web apps, running in the terminal.

The developers building these are web developers first. They reach for flexbox, scroll containers, mouse events, focus scopes, container queries, and Playwright-style testing without thinking about it -- not because terminals are secretly browsers, but because these patterns have been tested across thirty years of web UI development. They're what good looks like.

Silvery brings those patterns into the terminal honestly. It uses the vocabulary of the web where it makes sense -- `overflow="scroll"`, `position="sticky"`, `onClick`, semantic design tokens -- but it stays native to its medium. Silvery talks about cells, screens, buffers, ANSI, terminal protocols, scrollback. Not pixels, not viewports, not a DOM shim. The terminal is front and center.

## What's honest

Silvery is a work in progress. APIs may change. The community is small -- early adopters, not an established ecosystem. Ink has years of third-party packages and battle-tested production deployments that Silvery doesn't yet match.

What Silvery does have is architectural headroom. The problems it solves -- layout feedback, incremental rendering, scroll containers, focus management, multi-backend testing -- are problems you hit when your terminal app gets serious. If you're building a simple CLI, Ink is a solid choice with a bigger ecosystem and you should use it. If your CLI has grown into an app and you're fighting the framework, Silvery might be what you're looking for.

## The packages

| Package                           | What                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `silvery`                         | Components, hooks, renderer -- the one package you need            |
| `@silvery/ink` / `@silvery/chalk` | Ink compatibility -- 918/931 Ink 7.0 tests, 32/32 Chalk tests      |
| `@silvery/test`                   | Playwright-style testing -- locators, `press()`, buffer assertions |
| `@silvery/theme`                  | 84 color schemes, semantic tokens, auto-detect                          |
| `@silvery/commander`              | Beautiful CLIs for free -- help renders through Silvery itself     |
| `@silvery/headless`               | Pure state machines -- portable, no React                          |
| `@silvery/ansi`                   | Terminal primitives -- styling, SGR, detection                     |
| `@silvery/create`                 | Composable app builder -- `pipe()` providers                       |

And the standalone ecosystem projects:

- **[Flexily](https://beorn.codes/flexily)** -- Pure-TypeScript flexbox layout engine. Yoga-compatible, W3C spec, 2.5x faster, zero WASM.
- **[Termless](https://termless.dev)** -- Headless terminal testing against 10+ real parser backends. Like Playwright for terminal apps.
- **[terminfo.dev](https://terminfo.dev)** -- Terminal feature compatibility database. 161 features across 19 terminals, empirically probed.
- **[Loggily](https://loggily.dev)** -- Structured logging + tracing + metrics in one library. Zero dependencies.

## Three principles

Looking back, three principles guided every decision -- from the renderer to the testing library to the compatibility database.

**Take the best from the web.** Flexbox layout, scroll containers, focus scopes, DOM-style events, Playwright-style testing, semantic design tokens. If you'd reach for it on the web, reach for it in Silvery. Same names, same semantics, same instincts.

**Stay true to the terminal.** Silvery is not pretending terminals are browsers. We talk about cells, screens, buffers, ANSI, terminal protocols, scrollback. When a capability maps onto a terminal protocol -- Kitty keyboard, OSC 52, synchronized output -- we expose it as a first-class feature, not a polyfill.

**Raise the bar.** For developer ergonomics, architecture composability, and performance. Not "good enough for now" -- each feature should be something you never want to replace.

These three compound. Taking from the web gives developers familiar tools. Staying terminal-native keeps those tools honest. Raising the bar means the familiar tools actually work better here than the ad-hoc alternatives they replace.

## Try it

```bash
npm install silvery react
```

```tsx
import { useState } from "react"
import { render, Box, Text, useInput } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await render(<Counter />).run()
```

Run the interactive examples:

```bash
npx silvery examples
```

Migrating from Ink? The [migration guide](https://silvery.dev/getting-started/migrate-from-ink) covers the path. Most apps need only an import change to get started, and you can adopt silvery-native APIs incrementally as you hit the ceilings that brought you here.

Powerful apps. Polished UIs. Proudly terminal.

- [silvery.dev](https://silvery.dev)
- [GitHub](https://github.com/beorn/silvery)
- [The Silvery Way](https://silvery.dev/guide/the-silvery-way) -- 10 design principles
- [Silvery vs Ink](https://silvery.dev/guide/silvery-vs-ink) -- full feature comparison
