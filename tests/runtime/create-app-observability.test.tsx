/**
 * createApp/runtime observability parity.
 *
 * Scheduler already wires the `bytes_out` and `mem` SILVERY_STRICT slugs.
 * Silver Code exercises the newer createApp/run path, so these monitors must
 * exist there too or live dogfood sessions silently miss the tier-1 probes.
 */

import React, { useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const monitorState = vi.hoisted(() => ({
  bytesOut: [] as Array<{
    recordWrite: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
  mem: [] as Array<{
    tick: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
}))

const savedEnv = vi.hoisted(() => {
  const DEBUG = process.env.DEBUG
  delete process.env.DEBUG
  return { DEBUG }
})

vi.mock("../../packages/ag-term/src/bytes-out-monitor.ts", () => ({
  createBytesOutMonitor: () => {
    const monitor = {
      recordWrite: vi.fn(),
      dispose: vi.fn(),
    }
    monitorState.bytesOut.push(monitor)
    return monitor
  },
}))

vi.mock("../../packages/ag-term/src/mem-monitor.ts", () => ({
  createMemMonitor: () => {
    const monitor = {
      tick: vi.fn(),
      dispose: vi.fn(),
    }
    monitorState.mem.push(monitor)
    return monitor
  },
}))

import { Box, Text } from "../../src/index.js"

function makeWritable() {
  let output = ""
  return {
    writable: {
      write(data: string): void {
        output += data
      },
    },
    get output() {
      return output
    },
  }
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

// Root km's vendor project may preload Silvery through setup files before this
// spec runs. Reset and import the runtime per test so the monitor mocks above
// bind to createApp's imports in both standalone and root-project runs.
async function importRuntime() {
  const [{ run }, { resetStrictCache }] = await Promise.all([
    import("../../packages/ag-term/src/runtime/run"),
    import("../../packages/ag-term/src/strict-mode"),
  ])
  resetStrictCache()
  return { run, resetStrictCache }
}

function UpdatingTraceFixture() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setN(1), 0)
    return () => clearTimeout(t)
  }, [])

  return (
    <Box id="trace-root" flexDirection="column">
      <Text id="trace-line">frame {n}</Text>
    </Box>
  )
}

describe("createApp/run SILVERY_STRICT observability monitors", () => {
  const originalStrict = process.env.SILVERY_STRICT

  beforeEach(() => {
    delete process.env.DEBUG
    monitorState.bytesOut.length = 0
    monitorState.mem.length = 0
    vi.resetModules()
  })

  afterEach(async () => {
    if (originalStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = originalStrict
    if (savedEnv.DEBUG === undefined) delete process.env.DEBUG
    else process.env.DEBUG = savedEnv.DEBUG
    const { resetStrictCache } = await importRuntime()
    resetStrictCache()
  })

  test("bytes_out monitor records frames and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "bytes_out"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>observable frame</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.bytesOut).toHaveLength(1)
    expect(monitorState.bytesOut[0]!.recordWrite).toHaveBeenCalled()
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![0]).toBe(1)
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![1]).toBeGreaterThan(0)
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![2]).toMatchObject({
      reason: "first-render",
      mode: "fullscreen",
      width: expect.any(Number),
      height: expect.any(Number),
      prevWidth: 0,
      prevHeight: 0,
      outputChars: expect.any(Number),
    })
    expect(sink.output.length).toBeGreaterThan(0)

    handle.unmount()
    expect(monitorState.bytesOut[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  test("mem monitor is constructed at the mem slug and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "mem"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>memory probe</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.mem).toHaveLength(1)
    handle.unmount()
    expect(monitorState.mem[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  test("per-slug opt-outs suppress monitor construction", async () => {
    process.env.SILVERY_STRICT = "1,!bytes_out,!mem"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>no probes</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.bytesOut).toHaveLength(0)
    expect(monitorState.mem).toHaveLength(0)
    handle.unmount()
  })

  test("explicit bytes_out,mem slugs do not retain render-phase node traces", async () => {
    process.env.SILVERY_STRICT = "bytes_out,mem"
    delete process.env.DEBUG
    delete process.env.SILVERY_TRACE_FRAMES
    delete process.env.SILVERY_INSTRUMENT
    delete process.env.SILVERY_CELL_DEBUG
    const { run } = await importRuntime()

    const g = globalThis as {
      __silvery_node_trace?: unknown
      __silvery_content_all?: unknown
      __silvery_content_detail?: unknown
    }
    delete g.__silvery_node_trace
    delete g.__silvery_content_all
    delete g.__silvery_content_detail

    const sink = makeWritable()
    const handle = await run(<UpdatingTraceFixture />, {
      writable: sink.writable,
      cols: 40,
      rows: 6,
    })

    await settle()

    expect(monitorState.bytesOut).toHaveLength(1)
    expect(monitorState.mem).toHaveLength(1)
    expect(g.__silvery_node_trace).toBeUndefined()
    expect(g.__silvery_content_all).toBeUndefined()

    handle.unmount()
  })
})
