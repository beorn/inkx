/**
 * term.size (devices/size.ts) — unit tests.
 *
 * Verifies the alien-signals-backed Size owner:
 *  - Initializes from stdout.columns / stdout.rows (with fallbacks).
 *  - Exposes reactive cols / rows / snapshot as callable ReadSignals.
 *  - Coalesces burst resize events via a trailing-edge debounce.
 *  - `effect(() => size.cols())` fires once per coalesced change.
 *  - First read installs the resize listener lazily.
 *  - Dispose stops listening and clears any pending coalesce timer.
 *
 * Bead: km-silvery.term-sub-owners
 */

import EventEmitter from "node:events"
import { describe, test, expect } from "vitest"
import { effect } from "@silvery/signals"
import { createSize, createFixedSize } from "../../packages/ag-term/src/runtime/devices/size"

// ============================================================================
// Helpers
// ============================================================================

// Mock stdout — mutable columns/rows that emits `resize` events synchronously
// (matches Node's real WriteStream behavior on SIGWINCH).
function createMockStdout(cols = 80, rows = 24): NodeJS.WriteStream {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  ;(stdout as unknown as { isTTY: boolean }).isTTY = false
  ;(stdout as unknown as { write: (s: string) => boolean }).write = () => true
  return stdout
}

const setDims = (stdout: NodeJS.WriteStream, cols: number, rows: number) => {
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  stdout.emit("resize")
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Test-friendly factory: shortens the trailing-edge debounce so the existing
 * coalescing tests can complete in tens of milliseconds rather than waiting
 * for the production default (200 ms). The trailing-edge contract is the
 * same at any window size — only the latency changes.
 */
const mkSize = (stdout: NodeJS.WriteStream, opts?: { cols?: number; rows?: number }) =>
  createSize(stdout, { coalesceMs: 16, ...opts })

/**
 * Subscribe to a size's coalesced resizes via `effect()`, skipping the seed
 * fire so the returned array contains only *changes* (matching the old
 * `size.subscribe(handler)` semantic).
 */
function observeChanges(size: ReturnType<typeof createSize>): {
  changes: Array<{ cols: number; rows: number }>
  stop: () => void
} {
  const changes: Array<{ cols: number; rows: number }> = []
  let seeded = false
  const stop = effect(() => {
    const s = size.snapshot()
    if (!seeded) {
      seeded = true
      return
    }
    changes.push(s)
  })
  return { changes, stop }
}

// ============================================================================
// Tests — createSize
// ============================================================================

describe("createSize: initialization", () => {
  test("reads cols/rows from stdout at construction", () => {
    const stdout = createMockStdout(132, 40)
    using size = mkSize(stdout)
    expect(size.cols()).toBe(132)
    expect(size.rows()).toBe(40)
    expect(size.snapshot()).toEqual({ cols: 132, rows: 40 })
  })

  test("falls back to 80x24 when stdout dims are zero", () => {
    const stdout = createMockStdout(0, 0)
    using size = mkSize(stdout)
    expect(size.cols()).toBe(80)
    expect(size.rows()).toBe(24)
  })

  test("falls back to 80x24 when stdout dims are missing", () => {
    const stdout = createMockStdout(0, 0)
    ;(stdout as unknown as { columns: number }).columns = undefined as unknown as number
    ;(stdout as unknown as { rows: number }).rows = undefined as unknown as number
    using size = mkSize(stdout)
    expect(size.cols()).toBe(80)
    expect(size.rows()).toBe(24)
  })

  test("explicit options override stdout dims", () => {
    const stdout = createMockStdout(100, 30)
    using size = createSize(stdout, { cols: 200, rows: 60 })
    expect(size.cols()).toBe(200)
    expect(size.rows()).toBe(60)
  })
})

describe("createSize: resize coalescing", () => {
  test("single resize fires effect with final dims", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)

    expect(changes).toEqual([{ cols: 100, rows: 30 }])
    expect(size.cols()).toBe(100)
    expect(size.rows()).toBe(30)

    stop()
  })

  test("same-size resize still publishes after coalescing", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 80, 24)
    await sleep(50)

    expect(changes).toEqual([{ cols: 80, rows: 24 }])
    expect(size.cols()).toBe(80)
    expect(size.rows()).toBe(24)

    stop()
  })

  test("burst of 3 resizes within 16ms coalesces to ONE notification", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(2)
    setDims(stdout, 110, 32)
    await sleep(2)
    setDims(stdout, 120, 35)

    await sleep(50)

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 120, rows: 35 })
    expect(size.cols()).toBe(120)
    expect(size.rows()).toBe(35)

    stop()
  })

  test("zero-dimension resize floors dims to last-good but still heals (repaint)", async () => {
    // A degenerate (0×0) resize never publishes 0×0 to the renderer — the
    // published dims stay at the last valid value. But it DOES republish a heal
    // at those last-good dims so the fullscreen runtime repaints over whatever
    // the multiplexer left on screen during the focus/workspace cycle. Pre-fix
    // this fired no notification (`force: validResize`), which swallowed the
    // heal and left the pane blank — @km/code/v0.2/19604-focus-blank.
    const stdout = createMockStdout(120, 40)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 0, 0)
    await sleep(50)

    // Dims unchanged (floored to last-good), but the heal republish fired.
    expect(changes).toEqual([{ cols: 120, rows: 40 }])
    expect(size.snapshot()).toEqual({ cols: 120, rows: 40 })

    setDims(stdout, 100, 30)
    await sleep(50)

    expect(changes).toEqual([
      { cols: 120, rows: 40 },
      { cols: 100, rows: 30 },
    ])
    expect(size.snapshot()).toEqual({ cols: 100, rows: 30 })

    stop()
  })

  test("two resizes separated by > coalesce window produce two notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(changes.length).toBe(2)
    expect(changes[0]).toEqual({ cols: 100, rows: 30 })
    expect(changes[1]).toEqual({ cols: 120, rows: 35 })

    stop()
  })

  test("coalesceMs: 0 disables coalescing — each resize fires immediately", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout, { coalesceMs: 0 })

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)

    // No wait needed — synchronous.
    expect(changes.length).toBe(2)

    stop()
  })

  test("trailing-edge debounce: late event during coalesce window resets the timer", async () => {
    // Trailing-edge contract: every event resets the pending timer, so the
    // flush only fires after `coalesceMs` of silence. Two events 30 ms apart
    // with a 50 ms window would have produced TWO publishes under a leading-
    // edge design (each event >16 ms apart, each starts its own timer); under
    // trailing-edge they collapse to ONE publish carrying the second event's
    // value.
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout, { coalesceMs: 50 })

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(30) // < window — event below resets the timer
    setDims(stdout, 110, 32)
    await sleep(100) // wait past the new window

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 110, rows: 32 })

    stop()
  })

  test("cmux-style burst (4 events at 80 ms intervals over ~300 ms) collapses to ONE publish", async () => {
    // Real-world repro: a cmux workspace switch fires 4–6 SIGWINCHs at
    // ~80 ms intervals carrying intermediate widths (e.g. 81→113→126→94).
    // The 200 ms production default debounce window must absorb the entire
    // burst into a single publish carrying the final geometry.
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout) // production default coalesceMs

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 81, 24)
    await sleep(80)
    setDims(stdout, 113, 24)
    await sleep(80)
    setDims(stdout, 126, 24)
    await sleep(80)
    setDims(stdout, 94, 24)
    await sleep(300) // wait past the trailing-edge window

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 94, rows: 24 })

    stop()
  }, 2000)

  test("multiple effects all receive the coalesced resize", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const a = observeChanges(size)
    const b = observeChanges(size)

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(a.changes).toEqual([{ cols: 120, rows: 35 }])
    expect(b.changes).toEqual([{ cols: 120, rows: 35 }])

    a.stop()
    b.stop()
  })

  test("stopping the effect halts future notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)
    expect(changes.length).toBe(1)

    stop()
    setDims(stdout, 120, 35)
    await sleep(50)
    expect(changes.length).toBe(1)
  })
})

describe("createSize: reactive effect subscription", () => {
  test("effect(() => size.cols()) fires on coalesced resize", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const observed: number[] = []
    const stop = effect(() => {
      observed.push(size.cols())
    })

    // Seed read captures the construction-time value.
    expect(observed).toEqual([80])

    setDims(stdout, 120, 35)
    await sleep(50)

    expect(observed).toEqual([80, 120])

    stop()
  })

  test("effect reads of size.rows and size.snapshot stay in sync", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const rowsLog: number[] = []
    const snapLog: Array<{ cols: number; rows: number }> = []

    const stopRows = effect(() => rowsLog.push(size.rows()))
    const stopSnap = effect(() => snapLog.push(size.snapshot()))

    setDims(stdout, 100, 50)
    await sleep(50)

    expect(rowsLog).toEqual([24, 50])
    expect(snapLog).toEqual([
      { cols: 80, rows: 24 },
      { cols: 100, rows: 50 },
    ])

    stopRows()
    stopSnap()
  })
})

describe("createSize: lazy install", () => {
  // The resize listener is installed on first read of any public ReadSignal.
  // Style-only createTerm() callers (chalk-compat paths in km-tui/text/*)
  // that never touch size pay zero listeners. Prevents the
  // MaxListenersExceededWarning (11+ resize listeners) observed when every
  // createTerm() eagerly wired one.
  test("no listener is installed at construction", () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
    // First read installs.
    size.cols()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
  })

  test("subsequent reads do not stack listeners", () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    size.cols()
    size.rows()
    size.snapshot()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
  })

  test("first read resyncs from live stdout — catches resize between construction and first read", () => {
    // Pre-fix behaviour: first read returned the construction-time seed and
    // stayed stale until the NEXT real resize event. Fixed by install-time
    // resync — on first read, re-poll stdout and publish if it differs.
    // See 2026-04-22 Pro review finding P0-2.
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    ;(stdout as unknown as { columns: number }).columns = 132
    ;(stdout as unknown as { rows: number }).rows = 40
    // No resize event emitted — but first read installs the listener AND
    // re-polls the live stdout, so we see the missed resize.
    expect(size.cols()).toBe(132)
    expect(size.rows()).toBe(40)
  })

  test("explicit options override disables install-time resync", () => {
    // When the caller passes cols/rows options, those are authoritative and
    // the first read must NOT overwrite them with live stdout values (tests
    // and emulator setup depend on this).
    const stdout = createMockStdout(100, 30)
    using size = createSize(stdout, { cols: 200, rows: 60 })
    ;(stdout as unknown as { columns: number }).columns = 132
    ;(stdout as unknown as { rows: number }).rows = 40
    expect(size.cols()).toBe(200)
    expect(size.rows()).toBe(60)
  })
})

describe("createSize: dispose", () => {
  test("dispose removes the resize listener when installed", () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)
    size.cols() // installs the listener
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
    size[Symbol.dispose]()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
  })

  test("dispose is idempotent", () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)
    size[Symbol.dispose]()
    expect(() => size[Symbol.dispose]()).not.toThrow()
  })

  test("dispose clears pending coalesce timer", async () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    // Dispose BEFORE the coalesce window flushes.
    size[Symbol.dispose]()

    await sleep(50)
    // No notification fired — the timer was cleared.
    expect(changes.length).toBe(0)

    stop()
  })
})

describe("createSize: stream-shared listener (no MaxListenersExceeded leak)", () => {
  // Bug `@km/silvery/resize-listener-leak` (P2). Every `bun km view` printed
  // `MaxListenersExceededWarning: 11 resize listeners added to [WriteStream]`
  // on stderr at startup because km-cli has many module-level
  // `const term = createTerm(process)` singletons. Each `createNodeTerm()`
  // calls `size.snapshot()` once at construction (eager-install for SIGWINCH
  // repaint, see `term-size-eager-install.test.ts`), and each install added a
  // *fresh* `process.stdout.on("resize")` listener — N call sites → N
  // listeners → Node's 10-listener default warning fired.
  //
  // Fix: `createSize(stdout)` reuses one underlying `stdout.on("resize")`
  // attachment per stream via refcounting. N Sizes on the same stream still
  // see one listener on the stream; each Size's dispose decrements the
  // refcount, and the underlying listener detaches when the count hits zero.
  // Per-Size delivery is fanned out internally — every Size still gets its
  // own `onResize` callback (signal updates, debounce timer) so the public
  // API is unchanged.
  test("N Sizes on the same stdout add at most ONE underlying listener", () => {
    const stdout = createMockStdout(80, 24)
    using a = mkSize(stdout)
    using b = mkSize(stdout)
    using c = mkSize(stdout)
    a.cols()
    b.cols()
    c.cols()
    // Pre-fix: 3 listeners (one per Size). Post-fix: 1.
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
  })

  test("N Sizes on the same stdout each receive resize notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using a = mkSize(stdout)
    using b = mkSize(stdout)

    const aChanges = observeChanges(a)
    const bChanges = observeChanges(b)

    setDims(stdout, 132, 40)
    await sleep(50)

    expect(aChanges.changes).toEqual([{ cols: 132, rows: 40 }])
    expect(bChanges.changes).toEqual([{ cols: 132, rows: 40 }])
    expect(a.cols()).toBe(132)
    expect(b.cols()).toBe(132)

    aChanges.stop()
    bChanges.stop()
  })

  test("disposing one Size leaves the shared listener intact for the rest", () => {
    const stdout = createMockStdout(80, 24)
    const a = mkSize(stdout)
    const b = mkSize(stdout)
    a.cols()
    b.cols()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)

    a[Symbol.dispose]()
    // b still active → listener stays attached.
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
    expect(b.cols()).toBe(80)

    b[Symbol.dispose]()
    // Last consumer gone → listener detached, refcount cleared.
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
  })

  test("simulates `bun km view` startup — 12 createSize calls, 1 listener", () => {
    // Reproduces the field repro from the bead acceptance criterion:
    // multiple `createTerm(process)` module-level singletons in km-cli.
    const stdout = createMockStdout(80, 24)
    const sizes = Array.from({ length: 12 }, () => mkSize(stdout))
    for (const s of sizes) s.snapshot()
    // Pre-fix: 12 listeners → MaxListenersExceededWarning at 11.
    // Post-fix: 1 shared listener regardless of N.
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
    for (const s of sizes) s[Symbol.dispose]()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
  })
})

// ============================================================================
// Tests — 19604 degenerate-flush repaint gap (#undead, #P0)
//
// @km/code/v0.2/19604-focus-blank — Silver Code blanks after a cmux workspace
// focus switch. The live zero-cell form (surface:304/372 read-screen
// nonspace=0 on an otherwise-live pane) localizes to the createSize
// trailing-edge debounce, NOT the renderer.
//
// Mechanism: a fullscreen pane is live at WIDE and showing content. A cmux
// workspace focus-RESTORE fires a SIGWINCH burst. The same-size republish on a
// focus restore is the DESIGNED healing path (size.ts:17-19 — "cmux/focus
// restores can corrupt terminal screen state without changing cols/rows ...
// fullscreen runtimes need the event so they can repaint/clear"). But the
// trailing-edge debounce collapses the whole burst into ONE flush that reads
// `stdout.columns/rows` at flush time. If that flush-time read is degenerate
// (0×0 — a hidden-pane straggler frame landing inside the window), `flush()`
// floors to last-good dims with `validResize=false`, so `publish(prev, prev,
// {force:false})` is SKIPPED (no change + no force). The owed repaint never
// fires → the runtime never repaints over the screen the multiplexer cleared →
// the pane settles BLANK until the next manual resize.
//
// This is the one path the emulator harness (createFixedSize, synchronous
// update) cannot exercise, which is why every hermetic termless 19604 test was
// green while the live pane blanked. The fix: a degenerate flush must still
// deliver the heal republish at last-good dims.
// ============================================================================

describe("createSize: 19604 focus-restore heal must survive a degenerate flush", () => {
  test("a focus-restore burst that FLUSHES on a degenerate 0×0 straggler still delivers the heal repaint", async () => {
    // Pane is live at WIDE, content on screen.
    const stdout = createMockStdout(120, 40)
    using size = createSize(stdout, { coalesceMs: 30 })

    const { changes, stop } = observeChanges(size)

    // Workspace switch-away then switch-back. The focus-restore fires a
    // same-size SIGWINCH (the heal), then a hidden-pane 0×0 straggler lands
    // LAST inside the debounce window — so the single coalesced flush reads
    // 0×0.
    setDims(stdout, 120, 40) // focus-restore same-size SIGWINCH (the heal)
    await sleep(5) // still inside the 30 ms window
    setDims(stdout, 0, 0) // hidden-pane straggler — flush reads this
    await sleep(60) // past the window → exactly one flush

    // Dims must stay at last-good (never publish 0×0 to the renderer).
    expect(size.snapshot()).toEqual({ cols: 120, rows: 40 })
    // The heal repaint is OWED: the multiplexer cleared the screen on the
    // focus cycle. A degenerate flush must still republish at last-good dims so
    // the fullscreen runtime repaints. Pre-fix: changes == [] (heal swallowed →
    // blank). Post-fix: exactly one same-size heal.
    expect(changes, "degenerate flush must still deliver the focus-restore heal").toEqual([
      { cols: 120, rows: 40 },
    ])

    stop()
  })

  test("a standalone degenerate 0×0 notification still heals at last-good dims", async () => {
    // The minimal shape: the pane is live; a single 0×0 frame (hidden-pane GUI
    // frame / focus blur-repair clear) arrives. The screen may have been
    // cleared; the runtime is owed a repaint. The published dims stay last-good
    // (never 0×0), but the heal republish must fire.
    const stdout = createMockStdout(120, 40)
    using size = createSize(stdout, { coalesceMs: 16 })

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 0, 0)
    await sleep(50)

    expect(size.snapshot()).toEqual({ cols: 120, rows: 40 })
    expect(
      changes,
      "a degenerate frame must heal at last-good dims, not swallow the repaint",
    ).toEqual([{ cols: 120, rows: 40 }])

    stop()
  })
})

// ============================================================================
// Tests — createFixedSize
// ============================================================================

describe("createFixedSize", () => {
  test("initial dims are set from the snapshot", () => {
    using size = createFixedSize({ cols: 100, rows: 30 })
    expect(size.cols()).toBe(100)
    expect(size.rows()).toBe(30)
    expect(size.snapshot()).toEqual({ cols: 100, rows: 30 })
  })

  test("same-size explicit update still notifies subscribers", () => {
    using size = createFixedSize({ cols: 100, rows: 30 })

    const { changes, stop } = observeChanges(size)

    size.update(100, 30)

    expect(changes).toEqual([{ cols: 100, rows: 30 }])

    stop()
  })

  test("update() fires effects with new dims", () => {
    using size = createFixedSize({ cols: 80, rows: 24 })
    const observed: Array<{ cols: number; rows: number }> = []
    const stop = effect(() => observed.push(size.snapshot()))

    size.update(120, 40)

    expect(size.cols()).toBe(120)
    expect(size.rows()).toBe(40)
    expect(observed).toEqual([
      { cols: 80, rows: 24 },
      { cols: 120, rows: 40 },
    ])

    stop()
  })

  test("update after dispose is a no-op", () => {
    const size = createFixedSize({ cols: 80, rows: 24 })
    const observed: Array<{ cols: number; rows: number }> = []
    const stop = effect(() => observed.push(size.snapshot()))

    size[Symbol.dispose]()
    size.update(120, 40)

    // Only the seed fire — update() after dispose writes nothing.
    expect(observed).toEqual([{ cols: 80, rows: 24 }])

    stop()
  })
})
