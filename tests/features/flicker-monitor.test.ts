/**
 * Tests for createFlickerMonitor — backs the SILVERY_STRICT=flicker slug
 * (alias intent: "cls_storm"). Detects repaint-storm-shaped output (fast
 * repetitive full-screen clears / scroll-region thrash — the
 * @ag/code/20297-pane-flicker-on-resize signature) and fails LOUD.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/flicker-monitor.test.ts
 */
import { describe, expect, test } from "vitest"
import { createFlickerMonitor } from "@silvery/ag-term/flicker-monitor"

interface CapturedLog {
  level: "warn" | "error"
  msg: string
  data?: unknown
}

function makeHarness() {
  const logs: CapturedLog[] = []
  const files: Array<{ path: string; contents: string }> = []
  let clock = 1_700_000_000_000 // arbitrary fixed epoch
  return {
    logs,
    files,
    advance(ms: number) {
      clock += ms
    },
    now() {
      return clock
    },
    logger: {
      warn: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "warn", msg: m, data })
      },
      error: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "error", msg: m, data })
      },
    },
    writeFile(path: string, contents: string) {
      files.push({ path, contents })
    },
  }
}

const CLEAR = "\x1b[2J"
const HOME = "\x1b[H"

/** A full-clear repaint storm frame: bare destructive 2J + a home + a row. */
function stormFrame(row: string): string {
  return `${CLEAR}${HOME}${row}`
}

/**
 * The LEGITIMATE post-20297 resize/focus frame: homes the cursor and rewrites
 * every cell, but emits NO destructive 2J. Sync-wrapped to mirror production.
 */
function syncedResizeRepaint(cols: number, rows: number): string {
  const SYNC_BEGIN = "\x1b[?2026h"
  const SYNC_END = "\x1b[?2026l"
  let body = HOME
  for (let r = 0; r < rows; r++) {
    body += `\x1b[${r + 1};1H` + "x".repeat(cols)
  }
  return `${SYNC_BEGIN}${body}${SYNC_END}`
}

describe("createFlickerMonitor", () => {
  test("Test A: a CLS/scroll storm (repeated 2J in the window) PANICS with the named diagnostic", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true, // assert via lastTrip without unwinding the stack
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // Simulate a resize-drag re-emitting a bare `2J` every frame at ~60fps.
    // 10 clear-frames inside ~166 ms ≪ 1 s window → well over the threshold of 3.
    for (let i = 0; i < 10; i++) {
      m.recordFrame(i, stormFrame(`frame ${i}`))
      h.advance(16)
    }

    const panic = h.logs.find((l) => l.level === "error")
    expect(panic, "a PANIC error must be logged").toBeDefined()
    expect(panic!.msg).toContain("PANIC repaint storm")
    expect(panic!.msg).toContain("full-screen clears")
    // The diagnostic NAMES the offending sequence + the culprit hint.
    expect(panic!.msg).toContain("\\x1b[2J")
    expect(panic!.msg).toContain("20297")

    expect(m.lastTrip?.kind).toBe("panic")
    expect(m.lastTrip!.clears).toBeGreaterThanOrEqual(3)
    expect(m.lastTrip!.windowMs).toBe(1_000)

    // A frame-summary file was dumped with the per-frame clear tally.
    const summary = h.files.find((f) => f.path.includes("flicker-panic"))
    expect(summary, "frame summary must be written").toBeDefined()
    expect(summary!.contents).toMatch(/^# frameNum\tts\tbytes\tfullClears\tscrollRegionResets/)

    m.dispose()
  })

  test("Test A (throwing): production default THROWS on a repaint storm (fail loud)", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      // noThrow omitted → production behavior: throw on PANIC.
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    expect(() => {
      for (let i = 0; i < 10; i++) {
        m.recordFrame(i, stormFrame(`frame ${i}`))
        h.advance(16)
      }
    }).toThrow(/PANIC repaint storm/)

    expect(m.lastTrip?.kind).toBe("panic")
    m.dispose()
  })

  test("Test B: a single synced resize repaint (the 20297-fix shape) does NOT trip", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // One large full-cell repaint that homes + rewrites every cell, NO `2J`.
    // This is exactly what a post-20297 resize/focus frame emits.
    m.recordFrame(0, syncedResizeRepaint(120, 40))

    expect(h.logs, "no warn/error for a single synced repaint").toHaveLength(0)
    expect(m.lastTrip, "no trip for the 20297-fix shape").toBeNull()
    // It registered ZERO storm signals (no 2J/3J anywhere in the repaint).
    const frame = m.snapshotFrames()[0]!
    expect(frame.bytes).toBeGreaterThan(2048) // a real large repaint
    m.dispose()
  })

  test("Test B (drag of resize repaints): many synced full repaints in a row do NOT trip", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // A live resize-drag fires tens of full repaints — every one homes +
    // rewrites cells with NO `2J`. The monitor must stay silent through ALL
    // of them; flicker is about destructive-clear repetition, not repaints.
    for (let i = 0; i < 30; i++) {
      m.recordFrame(i, syncedResizeRepaint(120, 40))
      h.advance(16)
    }

    expect(h.logs).toHaveLength(0)
    expect(m.lastTrip).toBeNull()
    m.dispose()
  })

  test("a single isolated 2J (startup / one explicit clear) does NOT trip", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // Startup alt-screen entry may legitimately emit one clear, then normal
    // diff frames with no clears.
    m.recordFrame(0, stormFrame("first paint"))
    h.advance(16)
    for (let i = 1; i < 20; i++) {
      m.recordFrame(i, `\x1b[${i};1Hupdate ${i}`) // incremental diff, no 2J
      h.advance(16)
    }

    expect(h.logs).toHaveLength(0)
    expect(m.lastTrip).toBeNull()
    m.dispose()
  })

  test("clears spread across SETTLE frames (slow trickle) do NOT trip", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // 5 clears total — but each separated by a clear-free settle frame in the
    // window. This is NOT a fast uninterrupted burst → must not trip.
    for (let i = 0; i < 5; i++) {
      m.recordFrame(i * 2, stormFrame(`clear ${i}`))
      h.advance(16)
      m.recordFrame(i * 2 + 1, `\x1b[1;1Hsettle ${i}`) // no 2J — a settle frame
      h.advance(16)
    }

    expect(h.logs, "settle frames break the burst").toHaveLength(0)
    expect(m.lastTrip).toBeNull()
    m.dispose()
  })

  test("scroll-region thrash (repeated DECSTBM resets) PANICS and is named in the diagnostic", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // A scroll storm: each frame carries a full clear AND a scroll-region
    // reset (`\x1b[r`). The clears drive the threshold; the scroll-region
    // resets are surfaced in the diagnostic.
    for (let i = 0; i < 8; i++) {
      m.recordFrame(i, `${CLEAR}\x1b[r${HOME}row ${i}`)
      h.advance(16)
    }

    const panic = h.logs.find((l) => l.level === "error")
    expect(panic).toBeDefined()
    expect(panic!.msg).toContain("scroll-region resets")
    expect(m.lastTrip!.scrollRegionResets).toBeGreaterThanOrEqual(3)
    m.dispose()
  })

  test("PANIC respects the cooldown — a sustained storm logs once, not every frame", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // 60 clear-frames over ~1 s — far more than the threshold, sustained.
    for (let i = 0; i < 60; i++) {
      m.recordFrame(i, stormFrame(`frame ${i}`))
      h.advance(16)
    }

    // Only one PANIC despite dozens of over-threshold frames (cooldown).
    expect(h.logs.filter((l) => l.level === "error")).toHaveLength(1)
    m.dispose()
  })

  test("partial erases (\\x1b[0J / \\x1b[1J / \\x1b[J) are NOT counted as full clears", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    // Erase-to-end / erase-to-start are partial, non-blanking — used by inline
    // and static output every frame. They must NEVER be a storm signal.
    for (let i = 0; i < 20; i++) {
      m.recordFrame(i, `\x1b[${i};1H\x1b[0Jline ${i}\x1b[1J\x1b[J`)
      h.advance(16)
    }

    expect(h.logs).toHaveLength(0)
    expect(m.lastTrip).toBeNull()
    expect(m.snapshotFrames().every((f) => f.signals.fullClears === 0)).toBe(true)
    m.dispose()
  })

  test("\\x1b[3J (viewport + scrollback erase) IS counted as a full clear", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    for (let i = 0; i < 8; i++) {
      m.recordFrame(i, `\x1b[3J${HOME}row ${i}`)
      h.advance(16)
    }

    expect(m.lastTrip?.kind).toBe("panic")
    m.dispose()
  })

  test("evicts entries older than 10s to keep memory bounded", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      panicClears: 1_000_000, // unreachable — just exercise recordFrame
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    for (let i = 0; i < 100; i++) {
      m.recordFrame(i, `\x1b[1;1Hframe ${i}`)
      h.advance(100)
    }
    h.advance(60_000) // well past the eviction horizon
    m.recordFrame(100, "\x1b[1;1Hlast")
    expect(m.snapshotFrames().length).toBe(1)
    m.dispose()
  })

  test("dispose() makes recordFrame a no-op", () => {
    const h = makeHarness()
    const m = createFlickerMonitor({
      noThrow: true,
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
    })

    m.dispose()
    // Even a full storm after dispose records nothing and never trips.
    for (let i = 0; i < 10; i++) {
      m.recordFrame(i, stormFrame(`frame ${i}`))
      h.advance(16)
    }
    expect(h.logs).toHaveLength(0)
    expect(m.snapshotFrames()).toHaveLength(0)
    expect(m.lastTrip).toBeNull()
  })
})
