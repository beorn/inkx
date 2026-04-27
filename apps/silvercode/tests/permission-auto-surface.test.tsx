/**
 * Layer 4 — permission UI auto-surfaces (modal-popup, claude-code / opencode
 * shape) and the composer is suppressed so accidental keystrokes from
 * in-flight typing don't answer the prompt.
 *
 * Bug: codex / ACP backends emit `RequestPermissionRequest` and silvercode
 * tracks it in `state.permissions`, but the `<RequestPermissionInbox>` modal
 * was gated on a separate `showInbox` boolean that only flipped on Ctrl+E or
 * the `/inbox` slash command. Result: the user saw no permission prompt;
 * codex hung forever waiting on a `respondPermission` write that the user
 * had no UI to trigger.
 *
 * Even after manually opening the inbox, pressing 'n' fell through to the
 * composer's TextArea (silvery has no priority/cancel between useInput
 * handlers — both fired, TextArea inserted 'n'). The fix disables the
 * composer's input while a permission is pending so in-flight keystrokes
 * cannot accidentally answer the prompt.
 *
 * This test reproduces the visible failure end-to-end through the real
 * `<App/>` renderer.
 */
import { describe, expect, test } from "vitest"
import { permissionRequestBefore } from "../src/test/scripts/permissionRequest.ts"
import { renderScenario } from "../src/test/render-harness.tsx"

describe("permission UI auto-surfaces", () => {
  test("inbox modal appears in the rendered frame when a permission-request arrives", async () => {
    const s = await renderScenario({ script: permissionRequestBefore, cols: 120, rows: 30 })
    try {
      // The inbox modal renders the title "Permission inbox". That string
      // only appears when the modal is mounted. Without auto-surface, the
      // user sees only a notification and codex blocks forever.
      expect(s.text).toContain("Permission inbox")
    } finally {
      s.dispose()
    }
  })
})
