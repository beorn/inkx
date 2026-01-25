/**
 * Body Content Test Fixture
 *
 * Replicates the structure of body-test.md for testing body content rendering:
 * - Board-level body content (paragraphs)
 * - Column-level body content (intro paragraphs before cards)
 * - Nested sections with body content
 */

import { board, column, paragraph, section, task } from "@km/storage"

export const BODY_CONTENT_BOARD = board("Body Content Test Board", [
  // Board-level body content (virtual body column)
  paragraph(
    "This is the board description paragraph - should appear in a virtual body column.",
  ),
  paragraph("Here's some code that's also body content:"),
  // Note: Skipping code block - tests don't assert on code formatting

  column("Column A", [
    paragraph(
      "This column has intro text before tasks - should be body cards.",
    ),
    paragraph("A second paragraph of intro."),
    section("Card A1", [task("Task in Card A1")]),
    section("Card A2", [task("Task in Card A2")]),
  ]),

  column("Column B", [
    section("Card B1", [
      task("Task with nested content"),
      task("Sub-task 1 (should be body if followed by subsection)"),
      task("Sub-task 2"),
      section("Nested Section", [task("Task in nested section")]),
    ]),
    section("Card B2", [task("Completed task", { done: true })]),
  ]),
])
