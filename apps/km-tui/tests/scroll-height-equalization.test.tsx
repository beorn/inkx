/**
 * Tests for body block spacing in columns view.
 *
 * Body blocks (paragraphs, code blocks, etc.) get extra spacing via marginBottom
 * in columns view, while structural items (sections) are rendered compactly.
 *
 * This was filed as km-flexx.scroll-height-equalization, but the root cause was
 * not a flexx bug — it was incorrect test fixtures using `li` nodes (which are
 * classified as body by extractBody) instead of `oi` nodes for structural items.
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("body block spacing in columns view", () => {
  test("body blocks have extra spacing, structural items are compact", () => {
    // Body items (type "p") come before structural items (type "oi")
    // extractBody classifies children: non-oi before first oi = body, oi = structural
    const nodes = item(
      "board",
      item(
        "col1",
        item.paragraph("body-para-one"),
        item.paragraph("body-para-two"),
        item.section("section-alpha", item("task-a1")),
        item.section("section-beta", item("task-b1")),
      ),
    )

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const bodyOneBox = board.screen.nodeBox("body-para-one")
    const bodyTwoBox = board.screen.nodeBox("body-para-two")
    const sectionAlphaBox = board.screen.nodeBox("section-alpha")
    const sectionBetaBox = board.screen.nodeBox("section-beta")

    expect(bodyOneBox).not.toBeNull()
    expect(bodyTwoBox).not.toBeNull()
    expect(sectionAlphaBox).not.toBeNull()
    expect(sectionBetaBox).not.toBeNull()

    // Body blocks have marginBottom=1 -> 2 row spacing
    const bodySpacing = bodyTwoBox!.y - bodyOneBox!.y
    expect(bodySpacing).toBe(2)

    // Structural items have no margin -> 1 row spacing (compact)
    const structuralSpacing = sectionBetaBox!.y - sectionAlphaBox!.y
    expect(structuralSpacing).toBe(1)
  })

  test("all-body column (no structural items) also works correctly", () => {
    // When ALL children are body (no oi), all get marginBottom=1
    const nodes = item(
      "board",
      item(
        "col1",
        item.paragraph("para-one"),
        item.paragraph("para-two"),
        item.paragraph("para-three"),
      ),
    )

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const paraOneBox = board.screen.nodeBox("para-one")
    const paraTwoBox = board.screen.nodeBox("para-two")
    const paraThreeBox = board.screen.nodeBox("para-three")

    expect(paraOneBox).not.toBeNull()
    expect(paraTwoBox).not.toBeNull()
    expect(paraThreeBox).not.toBeNull()

    // All body blocks have marginBottom=1 -> 2 row spacing
    expect(paraTwoBox!.y - paraOneBox!.y).toBe(2)
    expect(paraThreeBox!.y - paraTwoBox!.y).toBe(2)
  })

  test("all-structural column (no body) renders compactly", () => {
    // When ALL children are oi, none get marginBottom
    const nodes = item(
      "board",
      item(
        "col1",
        item.section("sec-one", item("task-1")),
        item.section("sec-two", item("task-2")),
        item.section("sec-three", item("task-3")),
      ),
    )

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const secOneBox = board.screen.nodeBox("sec-one")
    const secTwoBox = board.screen.nodeBox("sec-two")
    const secThreeBox = board.screen.nodeBox("sec-three")

    expect(secOneBox).not.toBeNull()
    expect(secTwoBox).not.toBeNull()
    expect(secThreeBox).not.toBeNull()

    // Structural items have no margin -> 1 row spacing (compact)
    expect(secTwoBox!.y - secOneBox!.y).toBe(1)
    expect(secThreeBox!.y - secTwoBox!.y).toBe(1)
  })
})
