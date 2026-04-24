/**
 * Layer 3 — permission round-trip via controller.
 *
 * Exercises the full awaiting-permission flow:
 *   1. Script a permission-request event.
 *   2. Assert store.status flips to "awaiting-permission".
 *   3. Call controller.respondPermission(..., true).
 *   4. Assert the fake session received the permission-response write.
 *   5. Script the permission-decision + subsequent text + turn-end.
 *   6. Assert status returns to idle.
 *
 * Regressions this catches
 * ------------------------
 * - A past refactor of respondPermission() branded the requestId via
 *   `as PermissionRequestId` in the wrong place, resulting in a silent no-op
 *   when the inbox button fired. The permission got stuck pending forever.
 * - Session store missed "permission-decision" → "idle" fallthrough when
 *   zero permissions remained, leaving the UI stuck at "awaiting-permission"
 *   after an approval.
 *
 * Also verifies the harness: `session.sent` records BOTH send() and
 * respondToPermission() writes in order, so a single assertion block can
 * check that the controller didn't interleave a stray user message into
 * a permission-only exchange.
 */
import type { PermissionRequestId, SessionId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"
import {
  FAKE_PERMISSION_ID,
  permissionRequestAfter,
  permissionRequestBefore,
} from "../src/test/scripts/permissionRequest.ts"

const SESSION = "fake-permission" as SessionId

describe("layer 3: permission flow", () => {
  test("request → respondPermission(true) → decision → idle", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    // Before: status is idle (no session-init yet), no permissions pending.
    expect(handle.store.state.get().status).toBe("idle")
    expect(handle.store.state.get().permissions).toHaveLength(0)

    // LLM side: emit init, user turn, assistant turn-start, permission-request.
    for (const event of permissionRequestBefore) fake.emit(event)
    const awaitingState = handle.store.state.get()
    expect(awaitingState.status).toBe("awaiting-permission")
    expect(awaitingState.permissions).toHaveLength(1)
    expect(awaitingState.permissions[0]!.requestId).toBe(FAKE_PERMISSION_ID)
    expect(awaitingState.permissions[0]!.tool).toBe("Bash")

    // Consumer approves via the controller. The fake records the write.
    controller.respondPermission(handle.id, FAKE_PERMISSION_ID as unknown as string, true)
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("permission-response")
    expect(fake.sent[0]!.payload).toEqual({ id: FAKE_PERMISSION_ID, approved: true })

    // LLM side: emit decision + text + turn-end.
    for (const event of permissionRequestAfter) fake.emit(event)
    const doneState = handle.store.state.get()
    expect(doneState.status).toBe("idle")
    expect(doneState.permissions).toHaveLength(0)
    // Assistant message has the post-approval text.
    const assistantMsg = doneState.messages.find((m) => m.role === "assistant")
    expect(assistantMsg?.text).toBe("Done.")

    // Regression: controller must NOT have sent any user-message writes.
    const userWrites = fake.sent.filter((s) => s.type === "user")
    expect(userWrites).toHaveLength(0)

    controller.closeAll()
  })

  test("denial also clears pending permission and returns to idle", async () => {
    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    for (const event of permissionRequestBefore) fake.emit(event)
    expect(handle.store.state.get().status).toBe("awaiting-permission")

    controller.respondPermission(handle.id, FAKE_PERMISSION_ID as unknown as string, false)
    expect(fake.sent[0]!.payload).toEqual({ id: FAKE_PERMISSION_ID, approved: false })

    // LLM still emits the decision (with approved=false) and the turn ends
    // — our controller can't synthesize this; it awaits the real response.
    fake.emit({
      kind: "permission-decision",
      sessionId: SESSION,
      requestId: FAKE_PERMISSION_ID,
      approved: false,
      ts: 1100,
    })
    fake.emit({
      kind: "turn-end",
      sessionId: SESSION,
      turnId: "a1" as never,
      stopReason: "permission_denied",
      ts: 1110,
    })
    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    expect(state.permissions).toHaveLength(0)

    controller.closeAll()
  })
})
