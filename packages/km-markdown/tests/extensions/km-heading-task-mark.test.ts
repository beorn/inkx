/**
 * Tests for km-heading-task-mark transform.
 *
 * Verifies that task marks like [x], [ ], [/], [-], [!] at the start of
 * heading text are extracted into heading.data.taskMark and stripped from
 * the heading's text content.
 */

import { describe, expect, test } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import { kmHeadingTaskMarkTransform } from "../../src/extensions/km-heading-task-mark.ts"
import { nodeToText } from "../../src/parser.ts"

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parse(md: string) {
  const tree = fromMarkdown(md)
  kmHeadingTaskMarkTransform(tree)
  return tree
}

function firstHeading(md: string): any {
  const tree = parse(md)
  const heading = tree.children.find((c) => c.type === "heading")
  expect(heading).toBeDefined()
  return heading
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("km-heading-task-mark", () => {
  describe("task mark extraction", () => {
    test("[x] checked → taskMark='x', text stripped", () => {
      const h = firstHeading("### [x] Done task")
      expect(h.data.taskMark).toBe("x")
      expect(nodeToText(h)).toBe("Done task")
    })

    test("[ ] unchecked → taskMark=' ', text stripped", () => {
      const h = firstHeading("### [ ] Todo task")
      expect(h.data.taskMark).toBe(" ")
      expect(nodeToText(h)).toBe("Todo task")
    })

    test("[/] wip → taskMark='/', text stripped", () => {
      const h = firstHeading("### [/] WIP task")
      expect(h.data.taskMark).toBe("/")
      expect(nodeToText(h)).toBe("WIP task")
    })

    test("[-] dropped → taskMark='-', text stripped", () => {
      const h = firstHeading("### [-] Dropped task")
      expect(h.data.taskMark).toBe("-")
      expect(nodeToText(h)).toBe("Dropped task")
    })

    test("[!] blocked → taskMark='!', text stripped", () => {
      const h = firstHeading("### [!] Blocked task")
      expect(h.data.taskMark).toBe("!")
      expect(nodeToText(h)).toBe("Blocked task")
    })

    test("[X] uppercase checked → taskMark='X', text stripped", () => {
      const h = firstHeading("### [X] Done uppercase")
      expect(h.data.taskMark).toBe("X")
      expect(nodeToText(h)).toBe("Done uppercase")
    })
  })

  describe("no task mark", () => {
    test("regular heading has no taskMark", () => {
      const h = firstHeading("### Regular heading")
      expect(h.data?.taskMark).toBeUndefined()
      expect(nodeToText(h)).toBe("Regular heading")
    })

    test("heading with brackets mid-text is not a task mark", () => {
      const h = firstHeading("### Some [x] inline")
      expect(h.data?.taskMark).toBeUndefined()
      expect(nodeToText(h)).toBe("Some [x] inline")
    })
  })

  describe("heading levels", () => {
    test("## level 2", () => {
      const h = firstHeading("## [x] H2 task")
      expect(h.depth).toBe(2)
      expect(h.data.taskMark).toBe("x")
      expect(nodeToText(h)).toBe("H2 task")
    })

    test("### level 3", () => {
      const h = firstHeading("### [/] H3 task")
      expect(h.depth).toBe(3)
      expect(h.data.taskMark).toBe("/")
      expect(nodeToText(h)).toBe("H3 task")
    })

    test("#### level 4", () => {
      const h = firstHeading("#### [-] H4 task")
      expect(h.depth).toBe(4)
      expect(h.data.taskMark).toBe("-")
      expect(nodeToText(h)).toBe("H4 task")
    })

    test("# level 1", () => {
      const h = firstHeading("# [ ] H1 task")
      expect(h.depth).toBe(1)
      expect(h.data.taskMark).toBe(" ")
      expect(nodeToText(h)).toBe("H1 task")
    })
  })
})
