# Terminal Integration Testing Architecture

Design document for testing Kitty keyboard protocol, modifier key tracking, mouse events, and other features that depend on the full `createApp` event pipeline.

## Problem Statement

Tests using `createRenderer` pass, but features don't work in the real app. The event dispatch paths are fundamentally different:

**createRenderer (test renderer):**
```
app.press(key) / app.stdin.write(raw)
  → splitRawInput(data)
  → parseKey(keypress)
  → inputEmitter.emit("input", keypress)
  → RuntimeContext listeners (useInput, useModifierKeys)
```

**createApp (production runtime):**
```
stdin data event
  → termProvider.events() (splitRawInput → parseKey → queue)
  → eventQueue (NamespacedEvent[])
  → processEventBatch()
    → bridge ALL key events to runtimeInputListeners (useModifierKeys gets modifier-only + release events)
    → filter modifier-only and release events from app handlers
    → handleFocusNavigation() (Tab, Escape scope management)
    → runEventHandler() (selection, virtual scrollback, then invokeEventHandler)
    → invokeEventHandler() (mouse dispatch, namespaced handlers)
  → doRender() + runtime.render()
```

### Key differences

| Feature | createRenderer | createApp |
|---------|---------------|-----------|
| Input parsing | `inputEmitter.emit("input", raw)` then each listener calls `parseKey` | `termProvider` does `parseKey`, events arrive pre-parsed |
| Modifier-only events | Passed to RuntimeContext as raw input, `useInput`/`useModifierKeys` filter locally | Bridged to runtimeInputListeners first, THEN filtered before app handlers |
| Key release events | Passed through `inputEmitter` | Bridged to listeners, then skipped for app handlers via `k.eventType === "release"` |
| Focus navigation | Tab/Shift+Tab/Escape handled directly in `sendInput` | `handleFocusNavigation()` in `processEventBatch` |
| Mouse events | `processMouseEvent` called directly from `app.click()`/`app.hover()` | Mouse events arrive via term provider, dispatched through `runEventHandler` |
| Selection | Not supported | Intercepts mouse events in `runEventHandler` |
| Event batching | Each keystroke triggers immediate render | `processEventBatch` coalesces events, renders once |
| Render timing | Synchronous: `act()` + `doRender()` in `sendInput` | Async: `await processEventBatch()` with microtask flushes |
| Focus events | Not supported | `term:focus` events bridged to `runtimeFocusListeners` |

### Proven failure

The test at `vendor/silvery/tests/features/key-release.test.tsx:279` demonstrates the gap. The termless test "modifier-only key event updates useModifierKeys in run() pipeline" FAILS because:

1. `term.write("\x1b[57444;9:1u")` feeds the xterm emulator's display buffer, not the application's input pipeline
2. The emulator-backed Term has `hasInput: () => false` and its `events()` generator only yields resize events
3. There is no mechanism to inject raw key sequences into the `createApp` event pipeline from outside

The same test works with `createRenderer` because `app.stdin.write("\x1b[57444;9:1u")` goes directly through `inputEmitter`.

## Architecture Analysis

### Layer Map

```
Layer 5: testEnv (km-tui)         -- wraps createRenderer, adds board fixtures
Layer 4: createRenderer (test)     -- virtual buffer, sync act() rendering
Layer 3: createApp (production)    -- zustand store, providers, event loop
Layer 2: run() (convenience)       -- thin wrapper over createApp
Layer 1: Term + termProvider       -- terminal abstraction + event source
Layer 0: xterm.js / real terminal  -- actual terminal emulator
```

### What each test infrastructure provides

**createRenderer** (`@silvery/test`):
- Virtual buffer (no ANSI output)
- Synchronous rendering via `act()`
- `app.press(key)` converts to ANSI via `keyToAnsi`/`keyToKittyAnsi`
- `app.stdin.write(raw)` injects raw bytes
- `app.click(x, y)` / `app.hover(x, y)` dispatch mouse events directly to node tree
- Auto-refreshing locators, `app.text`, `app.term` bound terminal
- `kittyMode` option makes `press()` use `keyToKittyAnsi`

**createTermless** (`@silvery/test`):
- Creates a Term backed by xterm.js
- Real ANSI processing through xterm emulator
- Used with `run()` for "production pipeline" tests
- `term.screen` / `term.scrollback` for assertions
- Missing: NO way to inject keyboard input into the event pipeline

**testEnv** (`km-tui`):
- Wraps `createRenderer` with board fixtures
- Adds `board.press()`, `board.expect()`, `board.command()` fluent API
- Injects fake repo, board state, theme
- No access to createApp features (selection, Kitty protocol detection, focus reporting)

### Gap: the middle ground is missing

There is no test infrastructure that provides BOTH:
1. Real `createApp` event pipeline (processEventBatch, focus navigation, modifier filtering, selection)
2. Deterministic, synchronous test control (no timing, no real PTY)

The createRenderer has the control but not the pipeline. The termless+run has the pipeline but not the control (and input injection is broken).

## Proposed Architecture

### Solution: Add stdin injection to emulator-backed Term

The simplest fix is to add a `sendInput(data: string)` method to the emulator-backed Term that pushes parsed key events into the event queue, making them flow through the full `createApp` pipeline:

```typescript
// In term.ts createBackendTerm():

const termBase = {
  // ... existing properties ...

  /** Inject raw terminal input as if the user typed it.
   *  The data is parsed (splitRawInput → parseKey) and pushed into the
   *  event queue, flowing through the full createApp event pipeline. */
  sendInput(data: string) {
    for (const raw of splitRawInput(data)) {
      if (isMouseSequence(raw)) {
        const parsed = parseMouseSequence(raw)
        if (parsed) {
          eventQueue.push({ type: "mouse", data: parsed })
        }
      } else {
        const [input, key] = parseKey(raw)
        eventQueue.push({ type: "key", data: { input, key } })
      }
    }
    if (eventResolve) {
      const resolve = eventResolve
      eventResolve = null
      resolve()
    }
  },
}
```

This also requires importing the key parsing functions into term.ts and adding `sendInput` to the Term interface.

### Alternative: headless mode stdin injection in createApp

Add a way for headless-mode createApp to accept injected stdin data. The `AppHandle.press(key)` already does this for named keys, but it bypasses `processEventBatch` (it calls `runEventHandler` directly). A lower-level method could inject raw bytes:

```typescript
// In AppHandle interface:
interface AppHandle<S> {
  // ... existing ...

  /** Inject raw stdin bytes. Parsed and processed through the full event pipeline. */
  stdinWrite(data: string): Promise<void>
}

// In createApp initApp():
async stdinWrite(data: string) {
  // Parse into events, push to eventQueue
  for (const raw of splitRawInput(data)) {
    const [input, key] = parseKey(raw)
    eventQueue.push({
      type: "term:key",
      provider: "term",
      event: "key",
      data: { input, key },
    })
  }
  if (eventQueueResolve) {
    const resolve = eventQueueResolve
    eventQueueResolve = null
    resolve()
  }
  // Wait for event loop to process
  await new Promise(r => setTimeout(r, 0))
}
```

### Recommendation: Both, but Term.sendInput is primary

**Term.sendInput** is the right abstraction because:
1. It makes the Term a complete input/output abstraction (currently it's output-only for emulators)
2. It composes naturally with `run()` and `createApp()` -- events flow through the real pipeline
3. Tests can inject ANY raw sequence (Kitty protocol, mouse SGR, focus events, bracketed paste)
4. No changes needed to createApp -- the events arrive through the existing `termProvider.events()` path

**AppHandle.stdinWrite** is useful as a convenience but is secondary. The current `handle.press()` already handles most cases for headless mode. The gap is only for raw protocol injection, which is better solved at the Term level.

## Concrete Changes Needed

### 1. Add `sendInput()` to Term interface

**File:** `vendor/silvery/packages/ag-term/src/ansi/types.ts`

Add to `TermEmulator` interface:
```typescript
/** Inject raw terminal input bytes (keyboard sequences, mouse events).
 *  Parsed and pushed into the event queue for the event loop. */
sendInput?(data: string): void
```

**File:** `vendor/silvery/packages/ag-term/src/ansi/term.ts`

In `createBackendTerm()`:
```typescript
import { splitRawInput, parseKey } from "@silvery/tea/keys"
import { isMouseSequence, parseMouseSequence } from "../mouse"
import { parseBracketedPaste } from "../bracketed-paste"
import { parseFocusEvent } from "../focus-reporting"

// In termBase:
sendInput(data: string) {
  const pasteResult = parseBracketedPaste(data)
  if (pasteResult) {
    eventQueue.push({ type: "paste", data: { text: pasteResult.content } })
  } else {
    for (const raw of splitRawInput(data)) {
      const focusEvent = parseFocusEvent(raw)
      if (focusEvent) {
        eventQueue.push({ type: "focus", data: { focused: focusEvent.type === "focus-in" } })
        continue
      }
      if (isMouseSequence(raw)) {
        const parsed = parseMouseSequence(raw)
        if (parsed) {
          eventQueue.push({ type: "mouse", data: parsed })
        }
        continue
      }
      const [input, key] = parseKey(raw)
      eventQueue.push({ type: "key", data: { input, key } })
    }
  }
  if (eventResolve) {
    const resolve = eventResolve
    eventResolve = null
    resolve()
  }
},
```

Note: This exactly mirrors the `termProvider.events()` parsing pipeline in `term-provider.ts`, ensuring parity between real stdin and injected input.

### 2. Add `sendInput` to the Term type definition

**File:** `vendor/silvery/packages/ag-term/src/ansi/term.ts` (Term interface)

Add to the Term interface:
```typescript
/** Inject raw terminal input (as if the user typed it).
 *  Only available on emulator-backed terms. Throws on node/headless terms. */
sendInput(data: string): void
```

### 3. Fix the failing termless test

**File:** `vendor/silvery/tests/features/key-release.test.tsx`

Change:
```typescript
term.write("\x1b[57444;9:1u")
```
To:
```typescript
term.sendInput("\x1b[57444;9:1u")
```

### 4. Add `keyToKittyAnsi` support for modifier-only keys

**File:** `vendor/silvery/packages/tea/src/keys.ts`

Currently `keyToKittyAnsi("leftsuper")` falls through to `keyToAnsi()` which returns "" for modifier-only keys (KEY_MAP has `Super: null`). Add explicit support:

```typescript
export function keyToKittyAnsi(key: string): string {
  const parts = key.split("+")
  const mainKey = parts.pop()!
  const modifiers = parts.map(normalizeModifier)

  // Calculate modifier bitfield
  let mod = 0
  if (modifiers.includes("Shift")) mod |= 1
  // ... existing modifier handling ...

  // Check for modifier-only keys (leftsuper, leftshift, etc.)
  const modOnlyCodepoint = NAME_TO_KITTY_CODEPOINT[mainKey.toLowerCase()]
  if (modOnlyCodepoint !== undefined && isModifierKey(mainKey.toLowerCase())) {
    // Modifier-only keys include their own modifier in the bitfield
    // e.g., leftsuper press: codepoint=57444, modifier=9 (super=8 + 1)
    const selfMod = getModifierBit(mainKey.toLowerCase())
    const totalMod = mod | selfMod
    return `\x1b[${modOnlyCodepoint};${totalMod + 1}:1u`  // :1 = press event type
  }

  // ... rest of existing function ...
}

function isModifierKey(name: string): boolean {
  return ["leftshift", "rightshift", "leftcontrol", "rightcontrol",
          "leftalt", "rightalt", "leftsuper", "rightsuper",
          "lefthyper", "righthyper", "leftmeta", "rightmeta"].includes(name)
}

function getModifierBit(name: string): number {
  if (name.includes("shift")) return 1
  if (name.includes("alt")) return 2
  if (name.includes("control")) return 4
  if (name.includes("super")) return 8
  if (name.includes("hyper")) return 16
  if (name.includes("meta")) return 32
  return 0
}
```

This enables:
```typescript
keyToKittyAnsi("leftsuper")  // "\x1b[57444;9:1u" (press event)
```

For release events, add a modifier:
```typescript
keyToKittyAnsi("leftsuper:release")  // "\x1b[57444;1:3u" (release, no modifiers held after release)
```

Or add a separate function:
```typescript
keyToKittyRelease(key: string): string  // Same as keyToKittyAnsi but with :3 event type
```

### 5. Add `sendInput` convenience to `run()` handle

**File:** `vendor/silvery/packages/ag-term/src/runtime/run.tsx`

The `RunHandle` should expose `sendInput` for termless tests:
```typescript
export interface RunHandle {
  // ... existing ...
  /** Inject raw terminal input bytes (for testing Kitty protocol, mouse sequences, etc.) */
  sendInput(data: string): void
}

// In wrapHandle():
function wrapHandle<S>(handle: AppHandle<S>): RunHandle {
  return {
    // ... existing ...
    sendInput(data: string) {
      // This goes through the Term's sendInput, which pushes events into
      // the provider event queue, flowing through the full event pipeline
      // ... need access to the term instance
    }
  }
}
```

Actually, the simplest path is to just expose `term.sendInput()` since tests already have the term instance:

```typescript
// Test code:
const term = createTermless({ cols: 40, rows: 5 })
const app = await run(<App />, term, { kitty: true })

// Use term.sendInput for raw protocol injection
term.sendInput("\x1b[57444;9:1u")  // Kitty modifier-only key
await new Promise(r => setTimeout(r, 50))  // Allow event processing

expect(term.screen).toContainText("super=true")
```

### 6. Consider: createTestApp helper

For testing km-tui features that depend on createApp (like the command system with chord timing, or features gated behind Kitty protocol), a higher-level helper could wrap `run()` + `createTermless()`:

```typescript
// In @silvery/test or km-tui helpers:
export async function createTestApp(
  element: ReactElement,
  opts?: { cols?: number; rows?: number; kitty?: boolean; mouse?: boolean }
): Promise<TestApp> {
  const term = createTermless({ cols: opts?.cols ?? 80, rows: opts?.rows ?? 24 })
  const handle = await run(element, term, {
    kitty: opts?.kitty ?? true,
    mouse: opts?.mouse ?? true,
  })

  return {
    // Screen assertions (termless)
    get screen() { return term.screen },
    get scrollback() { return term.scrollback },

    // Input (goes through full pipeline)
    async press(key: string) {
      const ansi = keyToKittyAnsi(key)
      term.sendInput(ansi)
      await new Promise(r => setTimeout(r, 10))
    },

    async sendRaw(data: string) {
      term.sendInput(data)
      await new Promise(r => setTimeout(r, 10))
    },

    // Cleanup
    unmount() {
      handle.unmount()
      term[Symbol.dispose]()
    },
    [Symbol.dispose]() {
      this.unmount()
    },
  }
}
```

This is NOT a replacement for `createRenderer` (which is faster and synchronous). It's specifically for testing features that depend on the `createApp` event pipeline. The tradeoff is that it's async (requires `await` for press, ~10-50ms delays for event processing).

## What Should NOT Change

### createRenderer is fine for most tests

`createRenderer` is correct for testing:
- Component rendering (layout, styles, text)
- useInput handlers (press/release via stdin.write with raw Kitty sequences)
- useModifierKeys (via stdin.write with raw Kitty sequences)
- Focus management (Tab/Shift+Tab/Escape)
- Mouse events (click, hover, wheel via app methods)
- Buffer assertions (cell colors, attrs)

It works because `useInput` and `useModifierKeys` subscribe to RuntimeContext's `"input"` event, and `inputEmitter.emit("input", raw)` in `sendInput()` triggers the same `parseKey` → handler path. The missing piece is only the _outer_ event pipeline (selection, event batching, lifecycle key interception).

### testEnv is fine for km-tui board tests

Board tests don't need the production event pipeline. They test user journeys (keys → screen + persistence) using the createRenderer path. The command system, board-app handlers, and board state machine are all tested through `board.press()` which goes through `handleKey()` → the zustand store → React re-render.

## Testing Matrix

| Feature | createRenderer | termless + run() | createTestApp (proposed) |
|---------|:-------------:|:----------------:|:------------------------:|
| Component rendering | Yes | Yes | Yes |
| useInput (press) | Yes | Yes (handle.press) | Yes |
| useInput (release) | Yes (stdin.write raw) | **Broken** (no input injection) | Yes |
| useModifierKeys | Yes (stdin.write raw) | **Broken** | Yes |
| Modifier-only keys | Yes (stdin.write raw) | **Broken** | Yes |
| Focus reporting | No | No (events not bridged) | Yes |
| Selection (mouse drag) | No | Not testable | Yes |
| Event batching | No (sync, one-at-a-time) | Yes | Yes |
| Virtual scrollback | No | Not testable | Yes |
| Kitty protocol detection | No | Yes (kitty: true option) | Yes |
| Buffer/ANSI assertions | Buffer only | Screen (post-ANSI) | Screen (post-ANSI) |
| Speed | Fast (~1ms/test) | Medium (~30-100ms) | Medium (~30-100ms) |
| Deterministic timing | Yes (synchronous) | No (async, needs setTimeout) | No (async, needs setTimeout) |

## Implementation Priority

1. **Term.sendInput()** -- Unblocks all termless testing of Kitty features. Fixes the proven failure. Small change.

2. **keyToKittyAnsi for modifier-only keys** -- Enables `app.press("leftsuper")` in createRenderer tests and `term.sendInput(keyToKittyAnsi("leftsuper"))` in termless tests.

3. **Fix the failing test** -- Change `term.write(...)` to `term.sendInput(...)` in `key-release.test.tsx`.

4. **createTestApp helper** -- Nice to have for km-tui tests that need the full pipeline. Low priority since most features are testable with createRenderer.

## Questions Answered

### 1. What's the right way to test features that depend on the createApp event pipeline?

Use `createTermless()` + `run()` with `term.sendInput()` for raw protocol injection. The `handle.press()` method works for named keys. For raw Kitty sequences, mouse events, focus events, and bracketed paste, use `term.sendInput()` which feeds events through the full `termProvider → eventQueue → processEventBatch → runtimeInputListeners → runEventHandler` path.

### 2. Should createRenderer be extended to match createApp's event flow?

No. `createRenderer` should remain fast and synchronous. Its `inputEmitter` path is correct for testing components (useInput, useModifierKeys), which subscribe to RuntimeContext's `"input"` event. The filtering/batching/selection logic in `processEventBatch` is infrastructure-level behavior, not component behavior. Test infrastructure separately from components.

### 3. Should there be a createAppRenderer test helper?

Not as a replacement, but as a complement. A `createTestApp()` helper wrapping `createTermless()` + `run()` would provide the full pipeline for tests that need it. But the primary test infrastructure (`createRenderer`, `testEnv`) should stay as-is. See the `createTestApp` proposal above.

### 4. How should raw Kitty protocol injection work in tests?

Two mechanisms:

- **createRenderer tests:** `app.stdin.write("\x1b[57444;9:1u")` -- goes through `inputEmitter.emit("input", raw)`, listeners call `parseKey(raw)`. Works today for useInput/useModifierKeys.

- **termless/run tests:** `term.sendInput("\x1b[57444;9:1u")` -- parses the raw bytes (splitRawInput → parseKey) and pushes events into the Term's event queue, flowing through `termProvider.events()` → createApp's `processEventBatch`. Does NOT exist yet -- this is the primary proposed change.

For `keyToKittyAnsi` support for modifier-only keys like "leftsuper": add codepoint mapping and self-modifier bitfield calculation so `keyToKittyAnsi("leftsuper")` produces `"\x1b[57444;9:1u"`. This enables `app.press("leftsuper")` in kittyMode.

### 5. What changes to termless would enable full terminal integration testing?

Minimal changes needed in termless itself. The gap is in silvery's `Term` abstraction, not termless. The `createTermless()` function creates a Term with an xterm.js backend, and that Term is then passed to `run()`. Adding `sendInput()` to the emulator-backed Term is a silvery change, not a termless change.

However, termless could benefit from:
- A `keyToKittyAnsi()` export (or re-export from silvery) for test convenience
- Documentation on how to test Kitty protocol features using `term.sendInput()`

### 6. Proposed architecture for testing Kitty protocol features

```
                    createRenderer (fast, sync)
                    +---------------------------------+
                    | app.press("Super+a")            |
                    |   → keyToKittyAnsi("Super+a")   |
                    |   → "\x1b[97;9u"                |
                    |   → splitRawInput → parseKey    |
                    |   → inputEmitter.emit("input")  |
                    |   → useInput/useModifierKeys    |
                    +---------------------------------+

                    OR (raw injection):

                    | app.stdin.write("\x1b[57444;9:1u") |
                    |   → same path as above             |

                    termless + run() (production pipeline)
                    +-----------------------------------------+
                    | term.sendInput("\x1b[57444;9:1u")       |
                    |   → splitRawInput → parseKey            |
                    |   → Term eventQueue                     |
                    |   → termProvider.events()               |
                    |   → createApp eventQueue                |
                    |   → processEventBatch()                 |
                    |     → bridge to runtimeInputListeners   |
                    |     → filter modifier-only/release      |
                    |     → handleFocusNavigation()           |
                    |     → runEventHandler()                 |
                    |       → selection intercept             |
                    |       → invokeEventHandler()            |
                    |         → mouse dispatch to tree        |
                    |         → namespaced handler            |
                    |   → doRender() + runtime.render()       |
                    |   → ANSI output → xterm emulator        |
                    |   → term.screen assertions              |
                    +-----------------------------------------+
```

The key principle: **createRenderer tests components in isolation; termless tests the full pipeline end-to-end**. Features that only need component behavior (useInput handler, modifier state tracking, key release callbacks) use createRenderer. Features that depend on the event pipeline (event batching, selection, lifecycle key interception, focus reporting) use termless.

When both are needed (e.g., "modifier-only events are filtered from useInput but still reach useModifierKeys"), write both:
1. A createRenderer test proving the component behavior
2. A termless test proving the pipeline delivers the events correctly
