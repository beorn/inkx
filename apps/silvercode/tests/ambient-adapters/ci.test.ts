/**
 * Tests for the CI ambient adapter — Phase 6.b.
 *
 * The poller is exercised via `probeCiOnce` + `diffCi` (pure, easy to
 * test). The full timer-driven `registerCiAmbientAdapter` is exercised
 * with an injected `runGh` so no real `gh` subprocess is forked.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { diffCi, probeCiOnce, registerCiAmbientAdapter } from "../../src/ambient-adapters/ci.ts"

const SHA = "abcdef0123456789"
const SHA7 = "abcdef0"

function fakeGitState(branch: string = "main", sha: string = SHA) {
  return async (): Promise<{ branch: string; sha: string }> => ({ branch, sha })
}

function fakeGh(payload: unknown) {
  return async (): Promise<{ stdout: string; code: number }> => ({
    stdout: JSON.stringify(payload),
    code: 0,
  })
}

describe("ambient-adapter/ci", () => {
  describe("probeCiOnce", () => {
    test("returns parsed runs from a check-runs response", async () => {
      const result = await probeCiOnce({
        cwd: "/tmp",
        gitState: fakeGitState(),
        runGh: fakeGh([
          { name: "build", status: "completed", conclusion: "success" },
          { name: "test", status: "completed", conclusion: "success" },
        ]),
      })
      expect(result).not.toBeNull()
      const runs = result?.runs ?? []
      expect(runs).toHaveLength(2)
      expect(runs[0]?.conclusion).toBe("success")
    })

    test("returns null when no head sha is available", async () => {
      const result = await probeCiOnce({
        cwd: "/tmp",
        gitState: fakeGitState("main", ""),
        runGh: fakeGh([]),
      })
      expect(result).toBeNull()
    })

    test("returns empty runs when gh fails", async () => {
      const result = await probeCiOnce({
        cwd: "/tmp",
        gitState: fakeGitState(),
        runGh: async () => ({ stdout: "", code: 1 }),
      })
      expect(result?.runs ?? []).toEqual([])
    })

    test("accepts a wrapped {check_runs: [...]} response", async () => {
      const result = await probeCiOnce({
        cwd: "/tmp",
        gitState: fakeGitState(),
        runGh: fakeGh({ check_runs: [{ name: "ci", status: "completed", conclusion: "failure" }] }),
      })
      expect((result?.runs ?? [])[0]?.conclusion).toBe("failure")
    })
  })

  describe("diffCi", () => {
    const success = [{ name: "ci", status: "completed" as const, conclusion: "success" as const }]
    const failure = [{ name: "ci", status: "completed" as const, conclusion: "failure" as const }]
    const pending = [{ name: "ci", status: "in_progress" as const, conclusion: "" as const }]

    test("emits success when transitioning into all-passing", () => {
      expect(diffCi(null, { sha: SHA, runs: success })).toContain("all checks passing")
    })

    test("emits failure when transitioning into any failing", () => {
      expect(diffCi({ sha: SHA, runs: success }, { sha: SHA, runs: failure })).toContain("failure")
    })

    test("emits nothing when state is unchanged", () => {
      expect(diffCi({ sha: SHA, runs: success }, { sha: SHA, runs: success })).toBeNull()
    })

    test("emits pending when transitioning into in-progress", () => {
      expect(diffCi(null, { sha: SHA, runs: pending })).toContain("pending")
    })

    test("emits when sha changes even if aggregate state is the same", () => {
      const next = { sha: "fffffff0000000000000000000000000000abc", runs: success }
      expect(diffCi({ sha: SHA, runs: success }, next)).toContain("all checks passing")
    })

    test("includes failed check name in the failure message", () => {
      const namedFailure = [{ name: "build", status: "completed" as const, conclusion: "failure" as const }]
      const msg = diffCi(null, { sha: SHA, runs: namedFailure })
      expect(msg).toContain("build")
      expect(msg).toContain(SHA7)
    })

    test("returns null when the next snapshot has no runs", () => {
      expect(diffCi(null, { sha: SHA, runs: [] })).toBeNull()
    })
  })

  describe("register", () => {
    test("returns a disposer that stops polling", async () => {
      const scope = createScope("test")
      const queue = createChannelQueue(scope)
      let calls = 0
      const dispose = registerCiAmbientAdapter({
        scope,
        queue,
        cwd: "/tmp",
        pollMs: 10,
        gitState: async () => {
          calls++
          return { branch: "main", sha: SHA }
        },
        runGh: fakeGh([{ name: "ci", status: "completed", conclusion: "success" }]),
      })

      // Wait for at least one tick + one event.
      const start = Date.now()
      while (queue.peek().length === 0 && Date.now() - start < 1000) {
        await new Promise((r) => setTimeout(r, 5))
      }
      const before = calls
      dispose()
      // Give the loop a chance to run an extra tick if the dispose
      // missed; assert no further calls.
      await new Promise((r) => setTimeout(r, 50))
      expect(calls).toBeLessThanOrEqual(before + 1)

      const events = queue.peek()
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events[0]?.source).toBe("ci")
    })
  })
})
