# Composability — Universal Rendering Architecture

> **Deep-dive** for [era2-overview.md](../../reference/era2-overview.md). Framework×platform composability matrix.

_Status: draft (2026-03-19, updated 2026-03-30). What silvery's components are, how they compose, the tradeoffs vs platform-specific approaches, and what's theoretically possible._

## The Question

What if one codebase could render to terminal, web, and canvas — using React, Svelte, or Solid — with shared state, shared commands, and shared behavior? What would the components look like? What would you gain? What would you lose?

## Silvery's Five Components

Silvery decomposes into five independent components. Each solves one problem. They compose freely along two axes (framework x platform), with an optional app framework (create + scope + commands + signals + model) independent of both.

### 1. Abstract Nodes (@silvery/ag)

A data model for UI. Box, Text, and their properties (flexDirection, color, overflow, etc.) are pure data descriptions — not React components, not DOM elements.

**Analogy**: Like React Native's `<View>` and `<Text>` — UI intent, not platform specifics.

**The contract**: frameworks create these nodes, platforms render them. That's the entire interface.

### 2. Pipeline Interface (@silvery/ag)

The abstract rendering phases: measure → layout → diff → output. Ag defines the contracts; platforms provide implementations.

- **@silvery/ag-term**: implements all capabilities — flexily for layout, ANSI buffer for diff/output. Frameworks produce abstract nodes; the terminal platform renders them.
- **@silvery/ag-dom**: provides mapping and normalization only — node types → DOM elements, props → CSS, theme → custom properties. Frameworks use their native DOM capabilities (react-dom, Svelte compiler, Solid runtime) for reconciliation. The browser handles layout (CSS flexbox) and rendering.
- **@silvery/ag-canvas**: flexily for layout, draw calls for output. Similar to terminal — frameworks produce abstract nodes, platform renders them.

**Note:** Terminal and canvas are **platform-rendered** — the platform owns the full pipeline. Web is **framework-rendered** — the framework uses its native DOM capabilities through the platform's mapping layer. This means framework × platform is not fully orthogonal: terminal works identically regardless of framework, but web rendering depends on the framework's DOM capabilities.

Ag is thin — types, interfaces, theme tokens, utilities. Heavy lifting lives in platform packages.

### 3. Framework Adapters (@silvery/ag-react, @silvery/ag-svelte, ...)

Bridges between view frameworks and silvery's abstract nodes.

| Framework  | How it works                                                  | Virtual DOM?                     |
| ---------- | ------------------------------------------------------------- | -------------------------------- |
| **React**  | `react-reconciler` diffs virtual tree, patches abstract nodes | Yes                              |
| **Svelte** | Compiler generates direct abstract node operations            | No — compile-time knowledge      |
| **Solid**  | Fine-grained signal subscriptions update nodes directly       | No — subscription-time knowledge |

All produce the same abstract nodes. The pipeline downstream is identical.

**Signal bindings** bridge silvery signals to each framework's reactivity model (in `@silvery/signals/*` subpaths, not in the framework adapters):

- React: `useSignal()` via `useSyncExternalStore` (`@silvery/signals/react`)
- Svelte: signal store adapter via Svelte 5 runes (`@silvery/signals/svelte`, future)
- Solid: trivial -- Solid signals ~ silvery signals

### 4. Platform Adapters (@silvery/ag-term, @silvery/ag-dom, ...)

Bridges between the pipeline and a rendering target.

| Platform     | Output                       | Layout             | Input                           | Theme                 |
| ------------ | ---------------------------- | ------------------ | ------------------------------- | --------------------- |
| **Terminal** | ANSI sequences               | flexily            | stdin parsing → normalized keys | OSC palette detection |
| **Web**      | DOM elements (via framework) | Native CSS flexbox | DOM listeners → normalized keys | CSS custom properties |
| **Canvas**   | Draw calls                   | flexily            | Hit-testing → normalized keys   | Programmatic colors   |

**Input normalization**: each platform converts its native events to a common format (normalized key strings like `"ctrl+d"`, `"j"`, `"escape"`) before they reach the command system's `keymap()`. The app framework never sees platform-specific event types.

### 5. App Architecture (tea — v1.5)

Framework-agnostic, platform-agnostic state and behavior. Signals, commands, keymaps, models, scopes, op(). Zero dependency on ag, frameworks, or platforms. Design still settling — ships publicly at v1.5.

The tea packages (`@silvery/tea`, `@silvery/signals`, `@silvery/commands`, `@silvery/create`, `@silvery/scope`, `@silvery/model`) work standalone with react-dom or any framework — no ag rendering required. See [roadmap § v1.5](../../../roadmap.md#v15--app-architecture-tea).

## How They Compose

### The framework × platform matrix

Every cell is a valid combination:

```
                       Rendering Targets (platforms)
                       @silvery/ag-term    @silvery/ag-canvas    @silvery/ag-dom (future)
Frameworks             ────────────────    ──────────────────    ───────────────────────
@silvery/ag-react          ✓ (shipping)     monospace (v1)          future
@silvery/ag-svelte         future           future                  future
@silvery/ag-solid          future           future                  future
```

### One model, multiple views

Because the app framework is independent of rendering, one model can drive multiple views simultaneously:

```
                    app framework (model)
                    ┌───────────────────┐
                    │ signals + commands │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         React + ag-term  Svelte + ag-web  AI agent
         (CLI app)        (dashboard)      (automation)
              │               │               │
           Terminal         Browser         No view
           (ANSI)           (DOM)           (headless)
```

This works because:

1. **Signals are `{ (): T, (v: T): void }`** — function-call read/write, any subscriber model can track them
2. **Commands are `{ fn, args? }`** — any caller can invoke them
3. **Abstract nodes are data** — any framework can create them, any platform can render them

**Supported topology: single-process shared model.** Today, "one model, multiple views" means one JavaScript process with one model instance and multiple view subscribers. This covers the primary use cases: a terminal CLI and a web dashboard in the same Node.js process, or a headless test and a rendered view in the same test process.

Future topologies (server-authoritative model, replicated/event-sourced model across processes) require op-as-data serialization and are not yet designed. The op() infrastructure lays the groundwork — once ops are serializable records (not just local descriptors), they can be transmitted and replayed — but the synchronization protocol, conflict resolution, and failure handling are open design problems.

## The Tradeoffs

### What you gain from the universal approach

**Write once, render anywhere.** A component written with `<Box>` and `<Text>` works on terminal, web, and canvas without changes.

**The model IS the app.** Views are projections. Ship a CLI today, add a web dashboard later — the model doesn't change. Let an AI agent drive the app — it invokes the same commands.

**Progressive adoption.** Start with `silvery` (React + terminal). Extract state to signals when you need sharing. Add commands when you need automation. Use op() when you need undo. Each step is independent — you never rewrite.

**Test without rendering.** Models are pure state + behavior. Create with `.create(mockDeps)`, invoke commands, assert on signals. No DOM, no terminal, no framework.

### What you lose compared to platform-native development

The abstract component model can only express what ALL platforms can render. Anything platform-specific is either abstracted with graceful degradation, or excluded from the model.

| Capability                | Native web                       | Silvery universal                         | Status                                                                                                           |
| ------------------------- | -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Flexbox**               | Full CSS flexbox                 | Full (same semantics)                     | Parity                                                                                                           |
| **Grid**                  | CSS Grid                         | Not yet abstracted                        | Closable — add grid props; term emulates via flexily, web passes to native                                       |
| **Animations**            | CSS transitions/keyframes        | Not yet abstracted                        | Closable — add animation system; term: frame-by-frame, web: CSS                                                  |
| **Accessibility**         | ARIA roles, labels, live regions | Not yet abstracted                        | Closable — add role/aria-\* props; term ignores, web passes to DOM. **Priority: legally required for web apps.** |
| **Form elements**         | Native `<input>`, `<select>`     | Custom components (TextInput, SelectList) | Functional parity; web can delegate to native for a11y + mobile keyboard                                         |
| **SVG**                   | Full SVG spec                    | Not yet abstracted                        | Closable — add SVG components; term: box-drawing/braille, web: real SVG                                          |
| **Images**                | `<img>`, srcset                  | Not yet abstracted                        | Closable — add `<Image>`; term: sixel/kitty/ASCII, web: `<img>`                                                  |
| **Rich inline text**      | `<em>`, `<strong>`, `<a>`        | Bold/italic/link on Text                  | Closable — add inline formatting nodes                                                                           |
| **Arbitrary CSS**         | Full CSS                         | Not available                             | Escape hatch — className/style for web, term ignores                                                             |
| **Proportional fonts**    | Standard                         | Fixed-width on terminal                   | **Fundamental** — accept graceful degradation                                                                    |
| **Sub-pixel positioning** | Standard                         | Cell-grid on terminal                     | **Fundamental** — accept graceful degradation                                                                    |

**Two kinds of gaps:**

1. **Closable** — extend the abstract model. Each platform implements what it can, degrades gracefully where it can't. Tracked in bead: km-silvery.web-platform-gap.
2. **Fundamental** — proportional vs fixed-width fonts, unlimited vs 256 colors, pixel vs cell positioning. These are inherent platform differences. Design for the lowest common denominator, enhance on richer platforms.

**Accessibility deserves early investment.** Unlike other closable gaps, accessibility is legally required for web apps and structurally hard to retrofit. The recommendation: add semantic props (`role`, `aria-label`, `aria-live`, `tabIndex`) to `@silvery/ag`'s abstract node types NOW, even though only `@silvery/ag-dom` uses them initially. Terminal ignores them (screen readers don't read terminal apps). Canvas would need a parallel accessibility tree. By including them in ag early, all components and frameworks build with accessibility in mind from the start, avoiding the expensive "bolt it on later" pattern.

**Design principle**: the abstract model is the **floor**, not the ceiling. Platforms can render MORE than the model specifies (progressive enhancement). An `<Image>` shows a full image on web, falls back to ASCII art on terminal. What must NOT happen: a platform inventing components that don't exist in the abstract model.

### When to use the universal approach

- **Terminal + web** — same app, CLI and dashboard, shared model and commands
- **Multi-framework** — ship React today, explore Svelte later, model unchanged
- **AI-driven apps** — model is the API surface, views are optional
- **Portable component libraries** — write once, use in any silvery app

### When to use platform-specific instead

- **Web-only app** — use react-dom. Full CSS, full DOM API, no abstraction overhead.
- **Performance-critical rendering** — direct DOM/ANSI avoids pipeline indirection.
- **Platform-specific features** — WebGL, sixel graphics, native gestures don't abstract.

### The hybrid approach

**Four layers of app code, with different portability expectations:**

```
┌─────────────────────────────────────────────────────┐
│ Domain model (universal)                             │
│   signals, commands, business logic                  │
│   → works everywhere: terminal, web, test, AI        │
├─────────────────────────────────────────────────────┤
│ Surface model (per-platform)                         │
│   terminal state (cursor mode, alt screen)           │
│   browser state (scroll position, viewport)          │
│   → specific to a platform, but still model code     │
├─────────────────────────────────────────────────────┤
│ View components (portable or platform-specific)      │
│   <Box>/<Text> → portable across platforms           │
│   <div>/<span> → web-only                            │
│   ANSI sequences → terminal-only                     │
├─────────────────────────────────────────────────────┤
│ Runtime (per-deployment)                             │
│   providers, lifecycle, I/O                           │
│   → specific to how/where the app runs               │
└─────────────────────────────────────────────────────┘
```

The domain model is the portable core. Surface models handle platform-specific concerns. Views can be universal (using silvery abstractions) or platform-specific (using native APIs). Runtime is always deployment-specific.

Most real apps will be hybrid. The MODEL is universal (signals + commands). The VIEW uses abstract components where portability matters, platform-specific code where it doesn't:

```typescript
// Universal model — works everywhere
const chat = createModel(({ scope }) => {
  const messages = signal<Message[]>([])
  const commands = {
    submit: { fn(a: { text: string }) { ... }, args: z.object({ text: z.string() }) },
  }
  return { messages, commands }
})

// Universal component — works on terminal + web
function MessageList() {
  const msgs = useSignal(chat.get().messages)
  return (
    <Box flexDirection="column" gap={1}>
      {msgs.map(m => (
        <Text key={m.id} color={m.role === 'user' ? '$primary' : '$text'}>
          {m.content}
        </Text>
      ))}
    </Box>
  )
}

// Platform-specific component — richer web experience
function WebMessageList() {
  const msgs = useSignal(chat.get().messages)
  return (
    <div className="message-list" style={{ scrollBehavior: 'smooth' }}>
      {msgs.map(m => (
        <div key={m.id} className={`message ${m.role}`}
             dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
      ))}
    </div>
  )
}
```

The model doesn't know or care which view renders it.

## What's Theoretically Possible

### Today

- React + terminal (silvery's primary use case)
- Headless / AI / test (app-level packages alone, no rendering)
- Terminal in browser (xterm.js backend in @silvery/ag-term)
- Model shared between view and non-view consumers
- tea (with react-dom) -- app-level packages on native frameworks (React DOM, Svelte) without ag

### Near-term (new packages, architecture ready)

- @silvery/ag-dom — React terminal apps also run as web apps
- @silvery/ag-svelte — same model, different view framework
- Terminal + web simultaneously — CLI and dashboard share a model

### Theoretical limit (requires closing all gaps)

- One app, N views, M frameworks, K platforms — all sharing one model
- A Svelte web dashboard, a React terminal CLI, and an AI agent all controlling the same app
- Full undo/replay/collaboration via op-as-data
- Components that look native on every platform (graceful degradation + progressive enhancement)

### Fundamental limits (NOT possible)

- Visual parity between terminal and web — terminals have fixed-width cells, limited colors
- Zero-overhead abstraction — the abstract pipeline adds indirection vs direct rendering
- Abstracting everything — some capabilities are inherently platform-specific

The architecture is designed so these limits are explicit tradeoffs per-component, not global constraints on the app.

## What's Fundamentally Hard

| Challenge                         | Why                                                                                                                                                               | Mitigation                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Terminal ↔ web visual parity**  | Fixed-width cells vs proportional fonts, 256 colors vs unlimited, cell-grid vs pixel positioning                                                                  | Accept graceful degradation. Design for terminal, enhance on web.                               |
| **Framework interop**             | React and Svelte have different lifecycles, hooks, tooling. Running both requires two runtimes.                                                                   | Practical case is different views for different deployments, not mixing frameworks in one view. |
| **Component library abstraction** | SelectList, TextInput etc. are React components with hooks today. Making them framework-agnostic requires headless logic + framework-specific rendering wrappers. | Align with TEA: component logic as pure state machines, rendering as projection.                |
| **Native mobile**                 | React Native has its own component model. Bridging silvery → RN is another adapter.                                                                               | Future @silvery/ag-native package, or @silvery/ag-dom in a WebView.                             |
| **Performance at scale**          | Abstract nodes add indirection vs direct rendering.                                                                                                               | Negligible for most apps. Platforms can short-circuit for hot paths.                            |

## The Gradual Path

Two products, one gradient. See [roadmap § Track 2](../../../roadmap.md#track-2--silvery) for the version progression.

**Silvery** (rendering) is the ag pipeline, components, and theme. **App-level packages** (create + scope + commands + signals + model) provide commands, keymaps, op(), plugins, structured concurrency. The app framework is optional and adopted gradually -- each step adds capability without rewriting previous work.

```
"I want a terminal app"
  → npm install silvery. Use useState, zustand, whatever. Done.

"My state is getting tangled"
  -> Add signals (@silvery/signals). Shared state outside React.

"I want AI/tests to drive my app"
  → Add commands. dispatch(op) from anywhere — same code path as keyboard.

"I want vim-style keybindings"
  → Add keymaps. Declarative bindings with when() predicates.

"I want undo/replay"
  → Route mutations through op(). Serializable records for replay.

"I want the same app on the web"
  -> Use silvery components (Box/Text). Add @silvery/ag-dom. App-level code unchanged.

"I want Svelte instead of React"
  -> Add @silvery/ag-svelte. App-level code unchanged. Only views need rewriting.

"I want app-level packages on React DOM (no ag)"
  -> Add tea (with react-dom). Signals + commands + models on native react-dom.
```

Each step is independently valuable. Each solves a specific pain point. You never rewrite — you extract and recompose.
