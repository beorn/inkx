/**
 * createApp/runtime observability parity.
 *
 * Scheduler already wires the `bytes_out` and `mem` SILVERY_STRICT slugs.
 * Silver Code exercises the newer createApp/run path, so these monitors must
 * exist there too or live dogfood sessions silently miss the tier-1 probes.
 */

import React from "react"
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

import { Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"

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

describe("createApp/run SILVERY_STRICT observability monitors", () => {
  const originalStrict = process.env.SILVERY_STRICT

  beforeEach(() => {
    monitorState.bytesOut.length = 0
    monitorState.mem.length = 0
    resetStrictCache()
  })

  afterEach(() => {
    if (originalStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = originalStrict
    resetStrictCache()
  })

  test("bytes_out monitor records frames and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "bytes_out"
    resetStrictCache()

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
    expect(sink.output.length).toBeGreaterThan(0)

    handle.unmount()
    expect(monitorState.bytesOut[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  test("mem monitor is constructed at the mem slug and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "mem"
    resetStrictCache()

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
    resetStrictCache()

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
})
