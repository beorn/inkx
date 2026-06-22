/**
 * Integration test — scheduler constructs / does-not-construct the flicker
 * monitor based on SILVERY_STRICT. Mirrors scheduler-bytes-out-integration:
 * verifies the tier-1 gating + opt-out + dispose plumbing.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/scheduler-flicker-integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { RenderScheduler } from "@silvery/ag-term/scheduler"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode } from "@silvery/ag/types"

function makeMockStdout() {
  return {
    columns: 40,
    rows: 10,
    isTTY: false,
    write() {
      return true
    },
    on() {
      return this
    },
    off() {
      return this
    },
  } as unknown as NodeJS.WriteStream
}

function flickerMonitorOf(scheduler: RenderScheduler): unknown {
  return (scheduler as unknown as { flickerMonitor: unknown }).flickerMonitor
}

describe("scheduler flicker gating", () => {
  const originalStrict = process.env.SILVERY_STRICT

  beforeEach(() => {
    resetStrictCache()
  })

  afterEach(() => {
    if (originalStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = originalStrict
    resetStrictCache()
  })

  test("no monitor constructed when SILVERY_STRICT is unset", () => {
    delete process.env.SILVERY_STRICT
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect(flickerMonitorOf(scheduler)).toBeNull()
    scheduler.dispose()
  })

  test("monitor constructed at SILVERY_STRICT=1 (tier-1 default)", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect(flickerMonitorOf(scheduler)).not.toBeNull()
    scheduler.dispose()
  })

  test("monitor NOT constructed at SILVERY_STRICT=1,!flicker (opt-out)", () => {
    process.env.SILVERY_STRICT = "1,!flicker"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect(flickerMonitorOf(scheduler)).toBeNull()
    scheduler.dispose()
  })

  test("monitor constructed at SILVERY_STRICT=flicker (explicit slug only)", () => {
    process.env.SILVERY_STRICT = "flicker"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect(flickerMonitorOf(scheduler)).not.toBeNull()
    scheduler.dispose()
  })

  test("dispose() nulls the monitor", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect(flickerMonitorOf(scheduler)).not.toBeNull()
    scheduler.dispose()
    expect(flickerMonitorOf(scheduler)).toBeNull()
  })
})
