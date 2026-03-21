/**
 * Modifier Keys — verify useModifierKeys integration in the board bottom bar.
 *
 * Tests that modifier-only key events (Cmd/Shift/Ctrl/Alt) update the
 * modifier indicator in the bottom bar's StatusCounters component.
 *
 * Uses testEnv which goes through createRenderer → RuntimeContext →
 * useModifierKeys → StatusCounters.
 *
 * The createApp pipeline (production path) is tested separately in
 * vendor/silvery/tests/features/key-release.test.tsx.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("modifier key indicators in bottom bar", () => {
  test("Super+j shows ⌘ in bottom bar modifier indicator", () => {
    const { board } = testEnv(() => item("board", item("Todo", item("Task 1"))))

    // Before pressing modifier, no indicator should be present
    board.expect("#modifier-keys").not.toExist()

    // Super+j: keyToAnsi delegates to keyToKittyAnsi for Super modifier,
    // producing CSI 106;9u (j with super bit). This goes through
    // originalPress → inputEmitter → RuntimeContext → useModifierKeys.
    board.press("Super+j")

    // Bottom bar should show ⌘ indicator
    board.expect("#modifier-keys").toExist()
    const text = board.screenshot()
    expect(text).toContain("⌘")
  })

  test("regular key clears modifier indicator", () => {
    const { board } = testEnv(() => item("board", item("Todo", item("Task 1"))))

    // Press Super+j to set modifier
    board.press("Super+j")
    board.expect("#modifier-keys").toExist()

    // Press a regular key (no modifiers)
    board.press("j")

    // Modifier indicator should be cleared
    board.expect("#modifier-keys").not.toExist()
  })
})
