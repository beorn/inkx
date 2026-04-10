/**
 * Command Registry Contract Tests
 *
 * Structural tests verifying that the command system is internally consistent:
 * - Every registered command is dispatchable without crash
 * - Unknown commands are no-ops
 * - Every COMMAND_TO_KEYS entry has a registered command
 */

import { describe, test, expect } from "vitest"
import { createTestApp } from "./helpers/test-app.ts"
import { item } from "./helpers/board-test.ts"
import { getAllCommands, initCommandSystem } from "@km/commands"
import { assertNever } from "../src/action-handlers.ts"

// Ensure commands are registered before tests run
initCommandSystem()

describe("Command Registry Contracts", () => {
  test("every registered command is dispatchable without crash", () => {
    // Use a board with enough structure to avoid trivial edge cases
    using app = createTestApp(
      item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("task4"), item("task5")),
      ),
    )

    const commands = getAllCommands()
    expect(commands.length).toBeGreaterThan(0)

    // Commands that open persistent dialogs/overlays, exit the app, or require
    // pane state that doesn't exist in a single-pane test fixture.
    const skipCommands = new Set([
      "quit", // exits the app
      "force_quit", // exits the app
      // Pane commands require pane splits to exist — dispatching on a single-pane
      // board causes null dereference on rootPath. Tested separately in pane tests.
      "pane_focus_down",
      "pane_focus_up",
      "pane_focus_left",
      "pane_focus_right",
      "pane_focus_next",
      "pane_focus_prev",
      "pane_focus_previous",
      "pane_close",
      "pane_only",
      "pane_zoom",
      "pane_equalize",
      "pane_resize_grow",
      "pane_resize_shrink",
    ])

    const crashed: string[] = []

    for (const cmd of commands) {
      if (skipCommands.has(cmd.id)) continue

      try {
        app.dispatch(cmd.id)
      } catch (err) {
        crashed.push(`${cmd.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    expect(crashed, `Commands that crashed:\n${crashed.join("\n")}`).toHaveLength(0)
  })

  test("dispatching an unknown command does not throw", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    // dispatch() goes through dispatchCommandById which calls executeCommand
    // which returns null for unknown commands — should not throw
    expect(() => app.dispatch("nonexistent_command_xyz_42")).not.toThrow()
  })

  test("every COMMAND_TO_KEYS entry maps to a registered command", () => {
    // The COMMAND_TO_KEYS map in test-app.ts defines command → key mappings.
    // Verify each command ID actually exists in the registry.
    const commands = getAllCommands()
    const commandIds = new Set(commands.map((c) => c.id))

    // Replicate the COMMAND_TO_KEYS from test-app.ts — these are the commands
    // that test-app.command() can dispatch via key simulation
    const testAppCommands = [
      "cursor_down",
      "cursor_up",
      "cursor_left",
      "cursor_right",
      "cursor_first",
      "cursor_last",
      "block_nav_down",
      "block_nav_up",
      "fold_more",
      "unfold_more",
      "fold_all_more",
      "unfold_all_more",
      "zoom_inwards",
      "zoom_outwards",
      "enter_inline_edit",
      "enter_body_edit",
      "insert_below",
      "insert_above",
      "delete_node",
      "undo",
      "redo",
      "indent_node",
      "toggle_task_done",
      "cycle_task_status",
      "select_toggle",
      "filter",
      "show_help",
      "increase_content_lines",
      "decrease_content_lines",
      "local_find",
      "command_palette",
      "toggle_detail_pane",
      "task_dialog",
      "manage_favorites",
      "search_replace",
      "toggle_collapse",
      "toggle_hide_done",
      "cycle_view_mode",
      "visual_mode_enter",
      "hide_node",
      "toggle_show_hidden",
      "clear_filters",
      "pane_split_vertical",
      "toggle_sticky_fold",
      "open_in_system",
      "open_in_terminal",
      "enter_move_mode",
      "archive",
      "clear_task",
      "set_assignee",
      "set_due_date",
      "set_priority",
      "set_priority_0",
      "set_priority_1",
      "set_priority_2",
      "set_priority_3",
      "set_priority_4",
      // Note: "cycle_task_status_t" in COMMAND_TO_KEYS is a test-app alias for the
      // "t s" chord that dispatches "cycle_task_status" — not a separate registry command
      "set_recurring",
      "set_label",
    ]

    const missing = testAppCommands.filter((id) => !commandIds.has(id))
    expect(missing, `COMMAND_TO_KEYS entries not in registry: ${missing.join(", ")}`).toHaveLength(0)
  })

  test("all registered commands have required fields", () => {
    const commands = getAllCommands()

    for (const cmd of commands) {
      expect(cmd.id, `command missing id`).toBeTruthy()
      expect(cmd.name, `command ${cmd.id} missing name`).toBeTruthy()
      expect(cmd.category, `command ${cmd.id} missing category`).toBeTruthy()
      expect(typeof cmd.execute, `command ${cmd.id} missing execute function`).toBe("function")
    }
  })

  test("no duplicate command IDs in registry", () => {
    const commands = getAllCommands()
    const seen = new Set<string>()
    const duplicates: string[] = []

    for (const cmd of commands) {
      if (seen.has(cmd.id)) duplicates.push(cmd.id)
      seen.add(cmd.id)
    }

    expect(duplicates, `Duplicate command IDs: ${duplicates.join(", ")}`).toHaveLength(0)
  })
})

// =============================================================================
// Regression: action-handlers.test.ts
// =============================================================================

describe("Regression: action-handlers — assertNever", () => {
  test("throws Error with action type in message", () => {
    const fakeAction = { type: "UNKNOWN_OP" } as never
    expect(() => assertNever(fakeAction)).toThrow("Unhandled action type: UNKNOWN_OP")
  })

  test("thrown error is a standard Error", () => {
    const fakeAction = { type: "MISSING" } as never
    try {
      assertNever(fakeAction)
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toContain("MISSING")
    }
  })

  test("works with complex action objects", () => {
    const fakeAction = { type: "COMPLEX_OP", payload: { data: 42 } } as never
    expect(() => assertNever(fakeAction)).toThrow("Unhandled action type: COMPLEX_OP")
  })
})
