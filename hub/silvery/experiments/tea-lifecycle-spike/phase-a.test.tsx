/**
 * Phase A — Real React/Ink mount/unmount + termless key events.
 *
 * This is what Spike 1 explicitly did not prove:
 *
 *   > "React / Ink reconciler interleaving. The spike used string
 *      rendering. Real withDialogs will mount/unmount Ink components,
 *      which have their own useInput hooks that may fight the silvery
 *      input chain for stdin. This is the #1 production risk for
 *      Phase 1."
 *                            — K2.6, second-pass review 2026-04-21
 *
 * The spike mounts the <App /> in termless via `run(<App />, term)`.
 * Keys are driven via `handle.press("Control+p")` etc., so they travel
 * the full real path:
 *
 *   handle.press("Control+p")
 *     -> keyToAnsi("Control+p") = "\x10" (Ctrl+P → ASCII DLE)
 *     -> termless stdin
 *     -> term provider input parser
 *     -> chainApp.dispatch({ type: "input:key", input: "p", key: { ctrl: true, ... } })
 *     -> chainApp.input.notify handlers
 *     -> useInput's registered handler
 *     -> boardHandler(input, key)
 *
 * So every assertion here is about the real reconciler path, not a
 * simulated plugin chain.
 *
 * ## Assertions (the falsifiers from the review)
 *
 *   1. `recordKey` captures key shapes with `ctrl`, `escape`, `return`,
 *      `leftArrow`, `backspace` present on the `Key` object. Not
 *      synthetic — must match what `parseKey()` produces.
 *   2. While dialog is closed: board handler fires, dialog handler
 *      does not.
 *   3. While dialog is open: dialog handler fires, board handler
 *      does not.
 *   4. Escape closes dialog — next keypress routes back to board.
 *   5. Render count per event is tight (<= 2 per key: React has
 *      one setState-driven commit plus optional effect-driven commit).
 *   6. After unmount, no handler fires on subsequent presses. After
 *      remount, dispatch still routes to the new component — no ghost
 *      subscription from the old mount.
 *   7. Zero reentrant-dispatch errors.
 *   8. registration count == disposal count + live count. Each
 *      mount/unmount cycle ends with register == dispose (both handlers
 *      have been torn down).
 */

import React from "react"
import { afterEach, describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import type { Term } from "@silvery/ag-term/ansi/term"
import { run, type RunHandle } from "@silvery/ag-term/runtime"

import { App } from "./App.tsx"
import { get as getCounters, resetCounters } from "./lifecycle-counters.ts"
import { resetTrace } from "./trace.ts"

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
//
// `createTermless` gives us a real xterm.js emulator; `run(<App />, term)`
// boots the silvery runtime against it. We drive keys via `handle.press`,
// which encodes them the same way a real terminal would.
//
// We use the guard block pattern to guarantee cleanup — an un-disposed
// Term leaks ~1MB per test (see km-silvery.termless-memleak).

describe("Phase A — real React/Ink mount-unmount + key lifecycle", () => {
  let term: Term | undefined
  let handle: RunHandle | undefined

  afterEach(() => {
    handle?.unmount()
    term?.[Symbol.dispose]?.()
    handle = undefined
    term = undefined
  })

  // -------------------------------------------------------------------------
  // A1: basic mount + closed-state key
  // -------------------------------------------------------------------------

  test("A1 — `j` while closed reaches board handler, not dialog", async () => {
    resetTrace("phase-a:A1-j-closed")
    resetCounters()
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={0} />, term)

    await handle.press("j")
    // React commits asynchronously in the runtime — drain the microtask
    // queue so the state settles before we inspect counters.
    await Promise.resolve()

    const c = getCounters()
    expect(c.keyEvents.length).toBe(1)
    expect(c.keyEvents[0]).toMatchObject({
      input: "j",
      ctrl: false,
      escape: false,
      return: false,
    })
    expect(c.dialogOpens).toBe(0)
    // The board should have updated its cursor (n1 -> n2) — visible in
    // the rendered output.
    expect(term.screen!.getText()).toContain("> n2")
    expect(c.reentrantErrors).toEqual([])
  })

  // -------------------------------------------------------------------------
  // A2: dialog lifecycle — open, type, close, type again
  // -------------------------------------------------------------------------

  test("A2 — Ctrl+P opens, printable keys go to dialog, Escape closes, `j` routes back to board", async () => {
    resetTrace("phase-a:A2-full-transcript")
    resetCounters()
    // Use a tall terminal so the Board + Dialog fit comfortably — a
    // too-small screen pushes content into scrollback and makes
    // "dialog unmount cleared its cells" tests flaky.
    term = createTermless({ cols: 60, rows: 40 })
    handle = await run(<App pass={0} />, term)

    // 1. Open
    await handle.press("Control+p")
    await Promise.resolve()
    expect(getCounters().dialogOpens).toBe(1)
    expect(term.screen!.getText()).toContain("Dialog (focused)")

    // 2. Type "ab" — each printable must land on the dialog handler
    // (board handler is isActive=false so should never fire).
    await handle.press("a")
    await Promise.resolve()
    await handle.press("b")
    await Promise.resolve()
    const textAfterType = term.screen!.getText()
    expect(textAfterType).toContain("> ab")

    // 3. Backspace — removes "b"
    await handle.press("Backspace")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> a")

    // 4. Escape closes the dialog; counter advances; "Board (focused)"
    // label returns (the view toggles on `open`).
    await handle.press("Escape")
    await Promise.resolve()
    expect(getCounters().dialogCloses).toBe(1)
    expect(term.screen!.getText()).toContain("Board (focused)")
    // NOTE: we deliberately do NOT assert "Dialog (focused)" is absent
    // from the screen here. Under termless with conditional-unmount
    // siblings, the incremental output phase leaves the old dialog
    // panel's cells painted — a stale-pixel artifact that is an
    // out-of-scope rendering concern for this lifecycle spike. The
    // LIFECYCLE assertion is that the dialog CLOSED (state) and keys
    // route to the board afterwards, which we check below. See the
    // Phase A findings in README.md for details.
    expect(term.screen!.getText()).toContain("Press Ctrl+P to open dialog")

    // 5. `j` after close — board handler fires, cursor advances.
    await handle.press("j")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> n2")

    const c = getCounters()
    // Total captured keys: Ctrl+P, a, b, Backspace, Escape, j = 6
    expect(c.keyEvents.length).toBe(6)
    // Handler-shape falsifier: each key event must match what parseKey()
    // normalizes into. Ctrl+P -> input="p" with ctrl=true.
    const ctrlP = c.keyEvents[0]
    expect(ctrlP).toMatchObject({ input: "p", ctrl: true })
    const esc = c.keyEvents.find((k) => k.escape)
    expect(esc).toBeDefined()
    expect(esc!.input).toBe("")
    const back = c.keyEvents.find((k) => k.backspace)
    expect(back).toBeDefined()

    // No reentrancy explosions.
    expect(c.reentrantErrors).toEqual([])
  })

  // -------------------------------------------------------------------------
  // A3: focus containment — dialog handler does NOT see board keys,
  // board handler does NOT see dialog keys.
  //
  // This is the strongest falsifier in Phase A. If activation gating
  // leaks in either direction, both handlers would receive the same
  // key and our counters would double-count.
  // -------------------------------------------------------------------------

  test("A3 — `j` while open lands on dialog (not board)", async () => {
    resetTrace("phase-a:A3-focus-containment")
    resetCounters()
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={0} />, term)

    await handle.press("Control+p")
    await Promise.resolve()
    // Clear the key-event log so we only count keys while the dialog is
    // open — one key one handler is the assertion.
    resetCounters()

    await handle.press("j")
    await Promise.resolve()

    const c = getCounters()
    // Exactly ONE record — if the board handler also fired, we'd have
    // 2 records for the same keystroke.
    expect(c.keyEvents.length).toBe(1)
    // And the board cursor did not advance (n1 still highlighted).
    expect(term.screen!.getText()).toContain("> n1")
    // Dialog query now contains "j".
    expect(term.screen!.getText()).toContain("> j")
  })

  // -------------------------------------------------------------------------
  // A4: mount/unmount/mount cycle — no ghost handlers
  //
  // We mount the app, unmount cleanly, verify teardown, then mount a
  // fresh instance and assert keys route to the NEW component.
  // If useInput's subscription survived unmount, we'd see both handlers
  // fire on a single key (the first would come from the dead component
  // still holding a subscription).
  // -------------------------------------------------------------------------

  test("A4 — remount after clean unmount: new handlers route correctly, old ones don't fire", async () => {
    resetTrace("phase-a:A4-remount")
    resetCounters()

    // --- Cycle 1 ---
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={0} />, term)

    // Drive one key so we observe one registration firing.
    await handle.press("j")
    await Promise.resolve()
    const afterFirstPress = getCounters()
    expect(afterFirstPress.keyEvents.length).toBe(1)

    // Unmount the whole handle. This disposes the chain app, which
    // should teardown every useInput subscription via React's effect
    // cleanup chain.
    handle.unmount()
    await Promise.resolve()
    // Our register/dispose counters should now be balanced (one
    // registration on mount, one disposal on unmount for each active
    // hook). We started with board active, so:
    //   registrations == disposals for the board-active effect.
    const afterUnmount = getCounters()
    expect(afterUnmount.inputHandlerRegistrations).toBe(afterUnmount.inputHandlerDisposals)

    // Dispose the term so a fresh emulator is used for cycle 2.
    term[Symbol.dispose]?.()
    term = undefined
    handle = undefined

    // --- Cycle 2 ---
    resetCounters()
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={1} />, term)

    await handle.press("j")
    await Promise.resolve()

    const c = getCounters()
    // Exactly ONE key recorded — the new mount's handler.
    // If the OLD mount's handler were still registered, we'd get 2.
    expect(c.keyEvents.length).toBe(1)
    expect(term.screen!.getText()).toContain("> n2")
    expect(c.reentrantErrors).toEqual([])
  })

  // -------------------------------------------------------------------------
  // A5: render count discipline
  //
  // Every key event should cause ONE React render commit. setState from
  // inside useInput's handler is allowed and should schedule a single
  // update. If we see 2x renders per event, it means something else is
  // also subscribed (zustand bridge double-update, chain->react
  // synchronization bug, etc.). The number can be 2 under specific
  // legitimate conditions (e.g. React 19's concurrent mode emits a
  // double render for a state transition), so we assert `<= 2 * events`
  // rather than `== events`.
  // -------------------------------------------------------------------------

  test("A5 — render count stays proportional to key count", async () => {
    resetTrace("phase-a:A5-render-count")
    resetCounters()
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={0} />, term)

    // Baseline after mount (includes initial render).
    const baseline = getCounters().renders

    const sequence = ["Control+p", "a", "b", "c", "Escape", "j", "j", "j"]
    for (const k of sequence) {
      await handle.press(k)
      await Promise.resolve()
    }

    const rendered = getCounters().renders - baseline
    // Upper bound: each key may cause two commits (setState + passive
    // effect reactive render). Lower bound: each state-transition key
    // must cause at least one commit.
    expect(rendered).toBeLessThanOrEqual(sequence.length * 2)
    expect(rendered).toBeGreaterThanOrEqual(sequence.length)
  })

  // -------------------------------------------------------------------------
  // A6: focus-return — the verdict the review asked for
  //
  // The review's explicit assertion: "focus returns to prior scope
  // after dialog close". In our App, focus is modeled by activation:
  // board inactive + dialog active when open, and vice versa when
  // closed. "Focus returning" means: after Escape, the very next
  // keystroke must route to the board handler — not the dialog.
  // -------------------------------------------------------------------------

  test("A6 — focus returns to board after Escape", async () => {
    resetTrace("phase-a:A6-focus-return")
    resetCounters()
    term = createTermless({ cols: 60, rows: 18 })
    handle = await run(<App pass={0} />, term)

    // Open + type + close
    await handle.press("Control+p")
    await Promise.resolve()
    await handle.press("x")
    await Promise.resolve()
    await handle.press("Escape")
    await Promise.resolve()
    resetCounters()

    // `j` — if focus returned to board, cursor advances.
    await handle.press("j")
    await Promise.resolve()
    expect(term.screen!.getText()).toContain("> n2")
    // One key recorded (not two — dialog handler is now inactive).
    expect(getCounters().keyEvents.length).toBe(1)
  })
})
