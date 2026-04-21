> **Superseded (2026-04-11).** Canonical design: [app-composition.md](../../design/v10-terminal/app-composition.md). Public docs: `docs/guide/input-architecture.md`. Kept for reference.

# ag\* Event Architecture — Design Document

> Internal design doc. Public version: `docs/guide/input-architecture.md`

## The Pipeline

Every **keyboard** event follows the same 5-stage pipeline (matching the public doc). Other event types (resize, focus, mouse, paste) have their own paths documented in the event type matrix below.

```
STAGE 1: Provider           @silvery/ag-term/runtime/term-provider.ts
  stdin bytes → splitRawInput() → individual sequences
  Output: raw sequences + paste/resize/focus detection

STAGE 2: Parser              @silvery/ag/keys.ts
  raw sequences → parseKey() → structured Key objects
  Output: { input, key } with eventType, modifiers, text

STAGE 3: Event Loop          @silvery/create/create-app.tsx processEventBatch()
  - Bridges ALL events to RuntimeContext (unfiltered)
  - Filters release + modifier-only for app handlers (via isModifierOnlyEvent)
  - Dispatches to focus tree (Stage 4)
  - Calls app handler (TEA update / commands)
  - Renders after batch

STAGE 4: Focus Dispatch      @silvery/ag/focus-events.ts
  onKeyDown: capture → target → bubble (press/repeat only)
  onKeyUp: NOT YET WIRED (dispatchKeyEvent supports it, but processEventBatch
           filters release events before they reach focus dispatch)
  onClick: target → bubble (mouse)

STAGE 5: Hooks & Handlers    @silvery/ag-react/hooks/
  useInput()         — primary key hook (filtered: no release, no modifier-only)
  usePaste()         — paste hook (receives PasteEvent with source detection)
  useModifierKeys()  — modifier state tracking (unfiltered: sees ALL events)
  useInputLayer()    — layered input stack with bubbling
  useExit()          — programmatic exit
  useInput({onPaste}) — Ink-compat simple paste text callback
```

## Event Types — What Reaches Where

| Event         | Stage 3: RuntimeContext | Stage 4: Focus Props              | Stage 5: Hooks                          |
| ------------- | ----------------------- | --------------------------------- | --------------------------------------- |
| Key press     | ALL listeners           | onKeyDown (capture/target/bubble) | useInput handler                        |
| Key repeat    | ALL listeners           | onKeyDown (capture/target/bubble) | useInput handler                        |
| Key release   | ALL listeners           | SKIPPED (filtered at Stage 3)     | useModifierKeys + useInput({onRelease}) |
| Modifier-only | ALL listeners           | SKIPPED                           | useModifierKeys only                    |
| Paste         | runtimePasteListeners   | onPaste (target/bubble) [PLANNED] | usePaste(handler), useInput({onPaste})  |
| Mouse         | —                       | onClick/onMouseDown/etc           | —                                       |
| Resize        | —                       | —                                 | — (app handler only)                    |
| Focus in/out  | runtimeFocusListeners   | —                                 | useTerminalFocused                      |

**Key insight**: RuntimeContext gets ALL events unfiltered. Filtering happens in the hooks themselves (useInput) and in processEventBatch before calling the app handler. This is intentional — useModifierKeys needs release events that useInput filters out.

## Packages — What They Own

```
@silvery/ag           TYPES + PURE FUNCTIONS (no React, no I/O)
                      Key, BoxProps, AgNode, InputHandler, isModifierOnlyEvent()
                      FocusManager, dispatchKeyEvent(), focus-events
                      parseKey(), splitRawInput()

@silvery/ag-react     REACT BINDINGS (depends on: ag)
                      ALL hooks: useInput, useExit, useModifierKeys, useInputLayer, usePaste
                      ALL components: Box, Text, SelectList, TextInput, etc.
                      RuntimeContext, reconciler, runtime-subscribers

@silvery/ag-term      TERMINAL I/O + PIPELINE (depends on: ag, ag-react, create)
                      Term, createTerm, stdin/stdout handling
                      Render pipeline (measure, layout, render, output)
                      run() entry point — re-exports hooks from ag-react, zero implementations
                      PasteEvent, ClipboardData, copy-extraction

@silvery/create       APP COMPOSITION (depends on: ag, ag-react, ag-term)
                      createApp(), pipe(), with*() providers
                      processEventBatch() — THE central event loop
                      withCommands(), withDomEvents(), withFocus()
```

### Dependency graph

```
ag  ←──  ag-react  ←──  ag-term  ←──  create
                   ←─────────────────/
```

**Known issue**: ag-react imports from ag-term at runtime (layout engine, term types, copy-extraction) without declaring the dependency. Works via workspace resolution. A clean DAG would extract PasteEvent/ClipboardData/Term types to ag (pure types, no I/O). This is tracked but not blocking.

## Design Principles

### 1. Plugins own event flow — React is the view

The most important architectural principle. Event routing, precedence, filtering, and dispatch
are controlled by **plugins** (the `with*()` composition layer), not by React hooks or providers.

```
Terminal stdin → processEventBatch → PLUGIN CHAIN → Stores → React reads stores
```

Each plugin is a self-contained concern with its own **store** and **update functions**:

| Plugin               | Store                     | Update functions              | React hook (thin reader) |
| -------------------- | ------------------------- | ----------------------------- | ------------------------ |
| `withTerminal()`     | modifier state (internal) | `modifierUpdate(key) → state` | `useModifierKeys()`      |
| `withFocus()`        | focus tree + manager      | `focusUpdate(key) → handled?` | `useFocus()`             |
| `withInput()`        | handler registry          | dispatch to registered fns    | `useInput()`             |
| `withCommands(cmds)` | command registry          | `resolve(key, ctx) → cmd`     | —                        |
| `withDomEvents()`    | mouse processor           | hit test + dispatch           | —                        |

Note: Modifier tracking is a terminal concern (Kitty protocol), so it lives inside
`withTerminal()` rather than as a separate plugin. It updates a store that
`useModifierKeys()` reads. Other plugins that need modifier state (e.g., mouse events
for Cmd+click) also read from this store.

Plugins compose via `pipe()`. **Composition order is the authority for event precedence:**

```ts
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),
  withFocus(),          // Sees events first → focus tree dispatch
  withDomEvents(),      // Mouse events → component tree
  withCommands(cmds),   // Key → command resolution (fallback)
)
```

Each plugin wraps `press()` and decides: consume (handled) or pass through (not my concern).
A modal's `onKeyDown` for Escape fires BEFORE a global quit command — because `withFocus()`
is composed before `withCommands()`.

**Why this matters**: Without this principle, logic drifts into React components and providers.
React hooks become event routers instead of state readers. The event flow becomes implicit
(subscription order) instead of explicit (composition order).

**Reference**: The era2 architecture (`archive/era2-drafts/00-architecture.md`) defines
the full model: `create()` provides dispatch/apply, plugins wrap `app.apply(op)`,
input events are ops (`{ type: "input:key", ... }`) that flow through the apply chain.
`withReact()` fans out unhandled ops to `useInput` hooks registered via `app.onInput`.
Terminal state (cols, rows, modifiers) lives in the signals store. The current
`processEventBatch` is a stepping stone toward this model.

### 2. processEventBatch routes through the plugin chain

`processEventBatch()` is the event loop, not the event router. It batches terminal events
and calls `press()` for keyboard events. The plugin chain (which wraps `press()`) controls
what happens next.

**Current (wrong)**: processEventBatch bridges directly to RuntimeContext listeners (useInput)
before any plugin sees the event. Plugins only intercept the `press()` path.

**Target**: processEventBatch routes keyboard events through the same plugin chain as `press()`.
The event loop is a thin dispatcher; plugins own the routing logic.

### 3. React hooks are thin store readers

React hooks subscribe to plugin stores via `useSyncExternalStore`. They never control
event flow or routing.

| Pattern                    | What it does                                  | Examples                                    |
| -------------------------- | --------------------------------------------- | ------------------------------------------- |
| **Plugin store → hook**    | Hook reads state from plugin's store          | `useModifierKeys()`, `useFocus()`           |
| **Plugin registry → hook** | Hook registers handler in plugin's registry   | `useInput()` registers in withInput's store |
| **Prop** (focus-routed)    | Plugin dispatches to component via focus tree | `onKeyDown`, `onPaste`                      |

Hooks that need to register handlers (useInput) do so by writing to a store that the plugin reads.
The plugin decides when and whether to dispatch to those handlers — the hook doesn't control timing.

### 4. One implementation per concept

Every hook, type, and utility has ONE canonical definition. Re-export, never reimplement.

| Concept             | Canonical location         | Re-exported from                                |
| ------------------- | -------------------------- | ----------------------------------------------- |
| useInput            | ag-react/hooks/useInput.ts | ag-term/runtime, silvery/runtime                |
| useExit             | ag-react/hooks/useExit.ts  | ag-term/runtime, silvery/runtime                |
| usePaste            | ag-react/hooks/usePaste.ts | ag-term/runtime, silvery/runtime                |
| InputHandler        | ag/keys.ts                 | ag-react, ag-term/runtime                       |
| isModifierOnlyEvent | ag/keys.ts                 | ag-react (useInput), create (processEventBatch) |

### 5. Filtering happens at known stages, using shared functions

| Filter         | Where                       | Shared function                      |
| -------------- | --------------------------- | ------------------------------------ |
| Release events | useInput, processEventBatch | `key.eventType === "release"`        |
| Modifier-only  | useInput, processEventBatch | `isModifierOnlyEvent()` from ag/keys |

### 6. Event precedence: focused → fallback → app handler

When plugins own the flow, the default precedence is:

1. **Raw** — infrastructure that sees everything (modifier tracking, telemetry)
2. **Focused** — component-local dispatch via focus tree (`onKeyDown`, `onPaste`)
3. **Fallback** — global handlers that only see unhandled events (`useInput`, commands)

This means a TextInput's `onKeyDown` for Escape fires before useInput's quit handler.
If `withFocus()` consumes the event, `useInput` never sees it.

## Paste Design

### Current state (too many abstractions)

```
usePasteCallback(handler)     simple text callback — ag-react, re-exported as usePaste from run.tsx
usePaste() → PasteHandler     context getter — ag-react
usePasteEvents()              bridge: runtime → context — ag-react
PasteProvider                 context provider — ag-react
useInput({onPaste})           Ink compat text callback — ag-react
```

5 ways to handle paste. Too many.

### Target state

```
usePaste(handler)             THE paste hook — receives PasteEvent (text + source + data)
useInput({onPaste})           Ink compat — receives plain text string
```

2 ways. usePaste is the primary API. useInput({onPaste}) is Ink compat and convenience for apps that handle keys and paste in one place.

### usePaste API

```tsx
type PastePayload = {
  text: string
  /** Heuristic — terminal doesn't provide provenance, only bracketed paste detection */
  source: "internal" | "unknown"
  /** Only present when source is "internal" (matched against last copy) */
  internalClipboard?: ClipboardData
}

function usePaste(handler: (paste: PastePayload) => void): void
```

**Why `"unknown"` not `"external"`**: Bracketed paste (ESC[200~ / ESC[201~) only tells us
that pasted text arrived, not where it came from. `"internal"` is a heuristic match against
the last copied content. We can't positively identify external paste — only that it doesn't
match internal clipboard. (GPT 5.4 Pro review finding)

Simple use:

```tsx
usePaste((paste) => insertText(paste.text))
```

Rich use:

```tsx
usePaste((paste) => {
  if (paste.source === "internal" && paste.internalClipboard?.markdown) {
    insertMarkdown(paste.internalClipboard.markdown)
  } else {
    insertPlainText(paste.text)
  }
})
```

### onPaste prop — synthetic event (different from hook payload)

The hook receives a **payload** (data). The prop receives a **synthetic event** (with
stopPropagation/preventDefault), matching how React DOM distinguishes between handlers:

```tsx
<Box
  onPaste={(e) => {
    e.stopPropagation()
    insertText(e.nativeEvent.text)
  }}
/>
```

### Implementation

usePaste internally:

1. Registers handler in the paste plugin's handler store
2. Plugin enriches with internal clipboard detection (getInternalClipboard)
3. Plugin creates PastePayload
4. Plugin dispatches to registered handlers

This replaces usePasteEvents bridge + PasteProvider + usePasteCallback — all in one hook.
Logic lives in the plugin, not in React.

### Migration

1. Rewrite usePaste.tsx: from context getter to event subscription + enrichment
2. Add onPaste to FocusEventProps (ag/focus-events.ts) — focus-dispatched like onKeyDown
3. Wire processEventBatch to dispatch paste through focus tree via dispatchPasteEvent
4. Delete: PasteProvider, usePasteEvents, usePasteCallback, PasteHandler interface
5. Update TextInput/TextArea to use onPaste prop (receives PasteEvent)
6. Keep Ink compat: ink barrel's usePaste wraps `silveryUsePaste((e) => handler(e.text))`
7. Keep useInput({onPaste}) as-is

### Ink compat

Ink's `usePaste(handler)` expects `(text: string) => void`. Silvery's new `usePaste` expects `(event: PasteEvent) => void`. The Ink compat layer wraps:

```tsx
// @silvery/ink
export function usePaste(handler: (text: string) => void) {
  silveryUsePaste((event) => handler(event.text))
}
```

## Enforcement — How Rules Are Maintained

### Currently enforced (automated)

- **oxlint + oxfmt**: code style, unused imports, formatting
- **TypeScript strict mode**: type safety within packages
- **Vitest**: behavioral correctness

### Currently NOT enforced (convention only)

- **"Hooks only in ag-react"** — nothing prevents adding `export function use*` in run.tsx
- **"One implementation per concept"** — nothing detects duplicate type/function definitions
- **"No undeclared cross-package imports"** — ag-react imports from ag-term without package.json dep
- **"isModifierOnlyEvent from ag/keys"** — nothing prevents re-implementing the filter inline
- **"SubscriberList from runtime-subscribers.ts"** — nothing prevents local redefinition

### Planned enforcement

- **Import boundary lint rule**: oxlint rule to forbid `export function use*` outside ag-react/hooks/
- **Duplicate export detection**: CI check that no two packages export the same name with different types
- **Package dependency audit**: CI check that all imports are declared in package.json
- **Architecture doc freshness**: `/code clean` checks Stage N annotations match the doc

### How agents maintain the rules

CLAUDE.md → input-architecture.md → design principles section. The callout in CLAUDE.md
is the first line of defense. Stage annotations in code files are the second. The doc is the
reference. Agents should check the doc before adding new hooks or event handling code.

## Quality Plateau Assessment

### Done

- [x] All hooks in ag-react, zero implementations in run.tsx
- [x] isModifierOnlyEvent extracted to ag/keys — shared by useInput + processEventBatch
- [x] key.isModifierOnly flag set in parser (no more heuristic)
- [x] SubscriberList extracted to ag-react/runtime-subscribers.ts
- [x] Type collisions resolved (InputCallback/PasteCallback internal names)
- [x] CLAUDE.md points to architecture doc with callout
- [x] Code files annotated with "Stage N" + doc reference
- [x] Architecture doc updated with plugin-centric design principles
- [x] 6 doc/code contradictions fixed (Pro review finding)
- [x] Paste type corrected: source "internal" | "unknown" (not "external")

### Remaining (blocks plateau)

#### Plugin-centric event flow (P0 — the biggest gap)

- [ ] processEventBatch routes keyboard events through plugin chain (not direct to RuntimeContext)
- [ ] Event precedence: focused components before global hooks
- [ ] useInput becomes a fallback (only unhandled events), not a raw bridge
- [ ] useModifierKeys reads from a plugin store, not RuntimeContext directly
- [ ] Each plugin: store + update functions (modifier tracking may be internal to withTerminal)

#### Paste unification (P0)

- [ ] Rewrite usePaste: PastePayload with source "internal"|"unknown", internalClipboard
- [ ] onPaste prop: synthetic event (stopPropagation, preventDefault)
- [ ] Delete PasteProvider, usePasteEvents, usePasteCallback
- [ ] Focused onPaste fires before global usePaste (depends on plugin-centric flow)

#### Test coverage (P0)

- [ ] Tests for usePaste, useExit, useInputLayer
- [ ] Tests verifying plugin-chain event precedence

#### Package cleanup (P1)

- [ ] ag-react → ag-term undeclared dependency
- [ ] Import boundary lint rule

### Distance from plateau

**Architecture clarity**: 75%. Plugin-centric design is documented but not yet implemented.
The event flow still hardcodes routing in processEventBatch instead of delegating to plugins.
Pro review verdict: "Approve direction, block plateau claim."

**Code alignment**: 70%. Hooks unified, types deduplicated, shared filter. But event precedence
is wrong (useInput fires before focus tree) and paste still has 5 abstractions.

**Test coverage**: 60%. Key handling well tested. Paste, exit, input layer untested.

**Discoverability**: 95%. CLAUDE.md callout, code annotations, cross-references.

**Overall: ~65% to plateau. Plugin-centric event flow + paste unification + tests → 95%.**
