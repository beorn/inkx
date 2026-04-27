/**
 * Regression: ambient events arriving before any session is focused must
 * still land on a session's ambient stream — falling back to the first
 * session in the list when `focusedId` is empty.
 *
 * Symptom before fix: filewatch / tribe events fired during the controller
 * startup window (after `createSilvercodeController` but before the first
 * session has been focused) silently dropped from the ambient stream. The
 * channel queue still recorded them (so prompt-assembly stayed correct),
 * but they never appeared inline in the chat scrollback. Combined with the
 * referential-equality bug in `entries()`, this looked like "events appear
 * only after the user sends a prompt."
 *
 * Bead: km-silvercode.claude-acp-wire-bugs.
 */
import { describe, expect, test } from "vitest"
import { createFakeSession } from "../src/test/fake-session.ts"
import { createSilvercodeController } from "../src/controller.ts"
import { makeAmbientEventId } from "../src/ambient-adapters/types.ts"

describe("controller ambient stream — focus fallback", () => {
  test("ambient events fall back to first session when focusedId is empty", async () => {
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-ambient-fallback-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => createFakeSession(),
      // Disable real ambient adapters — we drive the channel queue directly
      // so the test is hermetic (no real fs.watch, no real tribe bus).
      disableAmbientAdapters: true,
      disableLegacyTribeSource: true,
    })

    // Spawn a session WITHOUT focusing it (focusedId may be set as a side
    // effect of the first spawn, so we explicitly clear it after).
    const handle = await controller.spawnSession("s1")
    controller.focus("") // unfocus everything — exercises the fallback path

    // Push an event through the channel queue. Without the fallback this
    // would land in the queue but skip the ambient stream entirely.
    controller.channelQueue.enqueue({
      id: makeAmbientEventId("filewatch"),
      source: "filewatch",
      content: "src/foo.ts changed",
      timestamp: Date.now(),
    })

    const entries = controller.ambientStream.entries(handle.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.source).toBe("filewatch")
  })

  test("ambient events go to focused session when one is focused", async () => {
    // Sanity check: the fallback only kicks in when focusedId is empty.
    // With focus set, events go to the focused session, not sessions[0].
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-ambient-focused-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => createFakeSession(),
      disableAmbientAdapters: true,
      disableLegacyTribeSource: true,
    })

    const a = await controller.spawnSession("a")
    const b = await controller.spawnSession("b")
    controller.focus(b.id)

    controller.channelQueue.enqueue({
      id: makeAmbientEventId("filewatch"),
      source: "filewatch",
      content: "src/bar.ts changed",
      timestamp: Date.now(),
    })

    expect(controller.ambientStream.entries(a.id)).toHaveLength(0)
    expect(controller.ambientStream.entries(b.id)).toHaveLength(1)
  })
})
