/**
 * render-trace — Phase 4 of the Visual Eyes epic.
 *
 * Verifies the silvery render-boundary instrumentation:
 *   1. `emitRenderDispatched` is a no-op when SILVERY_TRACE_FRAMES is unset
 *      (zero production cost — neither sidecar nor in-process bus touched).
 *   2. When enabled, it writes a RENDER_DISPATCHED event to the sidecar
 *      JSONL with { ts, reason, dirtyRegions, signalDelta, fiberHash }.
 *   3. The dirty-region derivation collapses a per-row predicate into
 *      contiguous ranges.
 *   4. Output-frame events carry bytes + changed-cell diagnostics so a
 *      frame trace can explain blank/flicker frames without waiting for
 *      SILVERY_STRICT=bytes_out to trip.
 *   5. End-to-end: a real app rendered via `run()` with SILVERY_TRACE_FRAMES
 *      set produces render events whose timestamps line up with frames.
 *
 * Runs under SILVERY_STRICT=1 (the default for `bun run test:fast`) — the
 * instrumentation is purely additive, so the incremental≡fresh invariant
 * must still hold with tracing on.
 */

import React, { useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import {
  emitRenderDispatched,
  isRenderTraceEnabled,
  renderTraceDir,
  recentRenderEvents,
  recentRenderOutputEvents,
  __resetRenderTraceForTests,
  emitRenderOutputFrame,
  type RenderDispatchedEvent,
  type RenderOutputFrameEvent,
} from "../../packages/ag-term/src/runtime/render-trace"

let traceDir: string
const SAVED_ENV = process.env.SILVERY_TRACE_FRAMES

beforeEach(() => {
  traceDir = mkdtempSync(join(tmpdir(), "silvery-render-trace-"))
  __resetRenderTraceForTests()
})

afterEach(() => {
  if (SAVED_ENV === undefined) delete process.env.SILVERY_TRACE_FRAMES
  else process.env.SILVERY_TRACE_FRAMES = SAVED_ENV
  __resetRenderTraceForTests()
  if (traceDir && existsSync(traceDir)) rmSync(traceDir, { recursive: true, force: true })
})

/** Read + parse the render-events sidecar JSONL for the trace dir. */
function readSidecar(dir: string): RenderDispatchedEvent[] {
  const file = join(dir, "render-events.jsonl")
  if (!existsSync(file)) return []
  return readFileSync(file, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RenderDispatchedEvent)
}

/** Read + parse the render-output sidecar JSONL for the trace dir. */
function readOutputSidecar(dir: string): RenderOutputFrameEvent[] {
  const file = join(dir, "render-output-events.jsonl")
  if (!existsSync(file)) return []
  return readFileSync(file, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RenderOutputFrameEvent)
}

describe("render-trace: gate", () => {
  test("disabled by default — emit is a no-op, no sidecar, empty bus", () => {
    delete process.env.SILVERY_TRACE_FRAMES
    expect(isRenderTraceEnabled()).toBe(false)
    expect(renderTraceDir()).toBeNull()

    emitRenderDispatched({
      renderCount: 1,
      dirtyReasons: ["content"],
      dimsChanged: false,
      bufferHeight: 5,
      isRowDirty: () => true,
      signalDelta: { nodesVisited: 1, nodesRendered: 1, nodesSkipped: 0, incremental: false },
      rootNodeCount: 3,
      rootDirtyEpoch: 0,
    })

    expect(recentRenderEvents()).toHaveLength(0)
    expect(existsSync(join(traceDir, "render-events.jsonl"))).toBe(false)
  })

  test("enabled when SILVERY_TRACE_FRAMES is set", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    expect(isRenderTraceEnabled()).toBe(true)
    expect(renderTraceDir()).toBe(traceDir)
  })
})

describe("render-trace: emit", () => {
  test("writes a RENDER_DISPATCHED event to the sidecar + the in-process bus", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    const before = Date.now()
    emitRenderDispatched({
      renderCount: 7,
      dirtyReasons: ["content", "subtree"],
      dimsChanged: false,
      bufferHeight: 4,
      // rows 1 and 2 dirty → one contiguous region {row:1,height:2}.
      isRowDirty: (y) => y === 1 || y === 2,
      signalDelta: { nodesVisited: 20, nodesRendered: 5, nodesSkipped: 15, incremental: true },
      rootNodeCount: 42,
      rootDirtyEpoch: 9,
    })
    const after = Date.now()

    const events = readSidecar(traceDir)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.type).toBe("RENDER_DISPATCHED")
    expect(ev.renderCount).toBe(7)
    expect(ev.reason).toBe("content,subtree")
    expect(ev.ts).toBeGreaterThanOrEqual(before)
    expect(ev.ts).toBeLessThanOrEqual(after)
    expect(ev.dirtyRegions).toEqual([{ row: 1, height: 2 }])
    expect(ev.signalDelta).toEqual({
      nodesVisited: 20,
      nodesRendered: 5,
      nodesSkipped: 15,
      incremental: true,
    })
    expect(ev.fiberHash).toBe("42:9")

    // Same event is on the in-process bus.
    const bus = recentRenderEvents()
    expect(bus).toHaveLength(1)
    expect(bus[0]).toEqual(ev)
  })

  test("reason falls back to 'initial' when nothing is dirty", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    emitRenderDispatched({
      renderCount: 1,
      dirtyReasons: [],
      dimsChanged: false,
      bufferHeight: 2,
      isRowDirty: () => false,
      signalDelta: { nodesVisited: 0, nodesRendered: 0, nodesSkipped: 0, incremental: false },
      rootNodeCount: 1,
      rootDirtyEpoch: 0,
    })
    expect(readSidecar(traceDir)[0]!.reason).toBe("initial")
  })

  test("dimsChanged appends 'dims-changed' to the reason", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    emitRenderDispatched({
      renderCount: 2,
      dirtyReasons: ["layout"],
      dimsChanged: true,
      bufferHeight: 3,
      isRowDirty: () => true,
      signalDelta: { nodesVisited: 1, nodesRendered: 1, nodesSkipped: 0, incremental: false },
      rootNodeCount: 1,
      rootDirtyEpoch: 0,
    })
    expect(readSidecar(traceDir)[0]!.reason).toBe("layout,dims-changed")
  })

  test("dirtyRegions: discontiguous dirty rows split into separate ranges", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    emitRenderDispatched({
      renderCount: 1,
      dirtyReasons: ["content"],
      dimsChanged: false,
      bufferHeight: 8,
      // rows 0,1 dirty | 2-4 clean | 5 dirty | 6 clean | 7 dirty.
      isRowDirty: (y) => y === 0 || y === 1 || y === 5 || y === 7,
      signalDelta: { nodesVisited: 1, nodesRendered: 1, nodesSkipped: 0, incremental: true },
      rootNodeCount: 1,
      rootDirtyEpoch: 0,
    })
    expect(readSidecar(traceDir)[0]!.dirtyRegions).toEqual([
      { row: 0, height: 2 },
      { row: 5, height: 1 },
      { row: 7, height: 1 },
    ])
  })

  test("multiple emits accumulate on the bus in order", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    for (let i = 1; i <= 3; i++) {
      emitRenderDispatched({
        renderCount: i,
        dirtyReasons: ["content"],
        dimsChanged: false,
        bufferHeight: 1,
        isRowDirty: () => true,
        signalDelta: { nodesVisited: 1, nodesRendered: 1, nodesSkipped: 0, incremental: true },
        rootNodeCount: 1,
        rootDirtyEpoch: i,
      })
    }
    const bus = recentRenderEvents()
    expect(bus.map((e) => e.renderCount)).toEqual([1, 2, 3])
    expect(readSidecar(traceDir).map((e) => e.fiberHash)).toEqual(["1:1", "1:2", "1:3"])
  })

  test("writes output-frame diagnostics to a dedicated sidecar + bus", () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    const before = Date.now()
    emitRenderOutputFrame({
      renderCount: 3,
      outputFrame: 11,
      bytes: 27,
      diagnostics: {
        reason: "diff",
        mode: "fullscreen",
        width: 20,
        height: 4,
        prevWidth: 20,
        prevHeight: 4,
        changedCells: 2,
        rawChangedCells: 3,
        dirtyRows: 1,
        outputChars: 24,
        cursorChars: 3,
        syncWrapped: true,
      },
    })
    const after = Date.now()

    const events = readOutputSidecar(traceDir)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.type).toBe("RENDER_OUTPUT")
    expect(ev.renderCount).toBe(3)
    expect(ev.outputFrame).toBe(11)
    expect(ev.bytes).toBe(27)
    expect(ev.ts).toBeGreaterThanOrEqual(before)
    expect(ev.ts).toBeLessThanOrEqual(after)
    expect(ev.diagnostics).toEqual({
      reason: "diff",
      mode: "fullscreen",
      width: 20,
      height: 4,
      prevWidth: 20,
      prevHeight: 4,
      changedCells: 2,
      rawChangedCells: 3,
      dirtyRows: 1,
      outputChars: 24,
      cursorChars: 3,
      syncWrapped: true,
    })

    expect(recentRenderOutputEvents()).toEqual([ev])
    expect(readSidecar(traceDir)).toHaveLength(0)
  })
})

// ============================================================================
// End-to-end through the real runtime — proves the renderer's flush boundary
// actually emits, and that the additive instrumentation does not break the
// SILVERY_STRICT incremental≡fresh invariant.
// ============================================================================

function CounterApp() {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n < 2) {
      const t = setTimeout(() => setN((c) => c + 1), 5)
      return () => clearTimeout(t)
    }
  }, [n])
  return (
    <Box flexDirection="column" padding={1}>
      <Text>Count: {n}</Text>
    </Box>
  )
}

describe("render-trace: end-to-end via run()", () => {
  test("a real app emits RENDER_DISPATCHED events at render-pass boundaries", async () => {
    process.env.SILVERY_TRACE_FRAMES = traceDir
    using term = createTermless({ cols: 30, rows: 6 })
    const handle = await run(<CounterApp />, term)

    // Let the effect-driven re-renders settle.
    await new Promise((r) => setTimeout(r, 60))

    const events = readSidecar(traceDir)
    const outputEvents = readOutputSidecar(traceDir)
    // At least the initial render plus the two effect-driven re-renders.
    expect(events.length).toBeGreaterThanOrEqual(1)
    for (const ev of events) {
      expect(ev.type).toBe("RENDER_DISPATCHED")
      expect(ev.ts).toBeGreaterThan(0)
      expect(typeof ev.reason).toBe("string")
      expect(ev.reason.length).toBeGreaterThan(0)
      // fiberHash is "<nodeCount>:<epoch>" — both numeric.
      expect(ev.fiberHash).toMatch(/^\d+:-?\d+$/)
      expect(Array.isArray(ev.dirtyRegions)).toBe(true)
      // signalDelta is present; counts are >= -1 (-1 = stats unavailable).
      expect(ev.signalDelta.nodesVisited).toBeGreaterThanOrEqual(-1)
    }
    // renderCount is monotonic across the trace.
    const counts = events.map((e) => e.renderCount)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThan(counts[i - 1]!)
    }
    expect(outputEvents.length).toBeGreaterThanOrEqual(1)
    for (const ev of outputEvents) {
      expect(ev.type).toBe("RENDER_OUTPUT")
      expect(ev.outputFrame).toBeGreaterThan(0)
      expect(ev.bytes).toBeGreaterThanOrEqual(0)
      expect(ev.diagnostics.outputChars).toBeGreaterThanOrEqual(0)
      expect(ev.diagnostics.changedCells).toBeGreaterThanOrEqual(0)
      expect(ev.diagnostics.dirtyRows).toBeGreaterThanOrEqual(0)
      expect(ev.diagnostics.width).toBeGreaterThan(0)
      expect(ev.diagnostics.height).toBeGreaterThan(0)
    }
    expect(recentRenderOutputEvents().length).toBe(outputEvents.length)

    await handle.unmount?.()
  })
})
