/**
 * Regression: notification events arriving before any session is focused must
 * still land on a session's notification stream — falling back to the first
 * session in the list when `focusedId` is empty.
 *
 * Symptom before fix: filewatch / tribe events fired during the controller
 * startup window (after `createSilvercodeController` but before the first
 * session has been focused) silently dropped from the notification stream. The
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
import { makeNotificationEventId } from "../src/notification-adapters/types.ts"

describe("controller notification stream — focus fallback", () => {
  test("notification events fall back to first session when focusedId is empty", async () => {
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-notification-fallback-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => createFakeSession(),
      // Disable real notification adapters — we drive the channel queue directly
      // so the test is hermetic (no real fs.watch, no real tribe bus).
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
    })

    // Spawn a session WITHOUT focusing it (focusedId may be set as a side
    // effect of the first spawn, so we explicitly clear it after).
    const handle = await controller.spawnSession("s1")
    controller.focus("") // unfocus everything — exercises the fallback path

    // Push an event through the channel queue. Without the fallback this
    // would land in the queue but skip the notification stream entirely.
    controller.channelQueue.enqueue({
      id: makeNotificationEventId("filewatch"),
      source: "filewatch",
      content: "src/foo.ts changed",
      timestamp: Date.now(),
    })

    const entries = controller.notificationStream.entries(handle.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.source).toBe("filewatch")
  })

  test("notification events go to focused session when one is focused", async () => {
    // Sanity check: the fallback only kicks in when focusedId is empty.
    // With focus set, events go to the focused session, not sessions[0].
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-notification-focused-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => createFakeSession(),
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
    })

    const a = await controller.spawnSession("a")
    const b = await controller.spawnSession("b")
    controller.focus(b.id)

    controller.channelQueue.enqueue({
      id: makeNotificationEventId("filewatch"),
      source: "filewatch",
      content: "src/bar.ts changed",
      timestamp: Date.now(),
    })

    expect(controller.notificationStream.entries(a.id)).toHaveLength(0)
    expect(controller.notificationStream.entries(b.id)).toHaveLength(1)
  })
})
