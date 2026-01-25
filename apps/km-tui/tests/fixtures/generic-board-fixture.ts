/**
 * Generic Board Test Fixture
 *
 * Simple board structure for testing TUI views, navigation, and keyboard interactions.
 */

import { board, column, section, task } from "@km/storage";

export const GENERIC_BOARD = board("Test Board", [
  column("To Do", [
    section("Task Group 1", [task("Task 1"), task("Task 2")]),
    section("Task Group 2", [task("Task 3")]),
  ]),

  column("In Progress", [section("Active Work", [task("Task 4")])]),

  column("Done", []),
]);
