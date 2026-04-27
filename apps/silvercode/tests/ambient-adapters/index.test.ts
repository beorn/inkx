/**
 * Tests for `registerAllAmbientAdapters` — Phase 6.b barrel.
 */

import { describe, expect, test } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { registerAllAmbientAdapters } from "../../src/ambient-adapters/index.ts"

describe("registerAllAmbientAdapters", () => {
  test("returns an idempotent disposer", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const dir = mkdtempSync(join(tmpdir(), "ambient-all-"))
    const dispose = registerAllAmbientAdapters({
      scope,
      queue,
      cwd: dir,
      // Disable the timer-driven CI poller so the test doesn't keep the
      // event loop alive — `disable.ci` makes register skip CI entirely.
      disable: { ci: true },
    })
    expect(typeof dispose).toBe("function")
    dispose()
    dispose() // safe to double-dispose
  })

  test("disable map skips named sources", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const dir = mkdtempSync(join(tmpdir(), "ambient-all-"))
    // Disable everything — no adapters wire up; queue stays empty.
    const dispose = registerAllAmbientAdapters({
      scope,
      queue,
      cwd: dir,
      disable: { tribe: true, filewatch: true, ci: true, recall: true, subagent: true },
    })
    expect(queue.peek()).toEqual([])
    dispose()
  })

  test("survives a missing tribe bus + invalid cwd", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const dispose = registerAllAmbientAdapters({
      scope,
      queue,
      cwd: "/nonexistent/path/for/test",
      disable: { ci: true },
      tribe: { busPath: "/also/not/here.jsonl" },
    })
    expect(typeof dispose).toBe("function")
    dispose()
  })
})
