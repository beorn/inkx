/**
 * Embed syntax leak test — km-tui.embed-syntax-leak
 *
 * Cards with mixed text + embed wikilinks (e.g., "Organize into boxes ![[file.jpg]]")
 * should NOT show raw `![[` characters in the display.
 *
 * The fix is in stripForDisplay() which now converts ![[target]] to just the
 * target name (or alias) instead of leaving the raw syntax.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"
import { stripForDisplay, getNodeDisplayName } from "@km/tree"
import type { KNode } from "@km/core"

describe("embed syntax leak", () => {
  // ── Unit tests: stripForDisplay ─────────────────────────────────────────

  test("stripForDisplay converts ![[target]] to target name", () => {
    expect(stripForDisplay("Organize into boxes ![[file.jpg]]")).toBe("Organize into boxes file.jpg")
  })

  test("stripForDisplay converts ![[target|alias]] to alias", () => {
    expect(stripForDisplay("Check ![[file.jpg|My Photo]]")).toBe("Check My Photo")
  })

  test("stripForDisplay handles standalone embed", () => {
    expect(stripForDisplay("![[file.jpg]]")).toBe("file.jpg")
  })

  test("stripForDisplay handles multiple embeds", () => {
    expect(stripForDisplay("See ![[a.png]] and ![[b.pdf]]")).toBe("See a.png and b.pdf")
  })

  test("stripForDisplay preserves regular wikilinks [[target]]", () => {
    expect(stripForDisplay("See [[my note]] for details")).toBe("See [[my note]] for details")
  })

  // ── getNodeDisplayName should not leak ![[  ────────────────────────────

  test("getNodeDisplayName does not leak ![[", () => {
    const node: KNode = {
      id: "test-node",
      type: "p",
      item: true,
      content: "Organize into boxes ![[file.jpg]]",
      embed_source: null,
      parent_id: null,
      parent_idx: 0,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const name = getNodeDisplayName(node)
    expect(name).not.toContain("![[")
    expect(name).toContain("file.jpg")
    expect(name).toContain("Organize into boxes")
  })

  // ── TUI rendering tests ────────────────────────────────────────────────

  test("mixed text + embed wikilink does not show raw ![[ in card", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("other-task")))

        // A regular task (not an embed) whose content contains inline embed wikilink syntax
        nodes.push({
          id: "mixed-content",
          type: "p" as const,
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "Organize into boxes ![[file.jpg]]",
          embed_source: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // The text "Organize into boxes" should appear
    expect(text).toContain("Organize into boxes")
    // The raw embed syntax should NOT appear
    expect(text).not.toContain("![[")
    // The target name should appear cleanly
    expect(text).toContain("file.jpg")
  })

  test("top bar does not leak ![[ when navigating to mixed-content card", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("other-task")))

        nodes.push({
          id: "mixed-content",
          type: "p" as const,
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "Organize into boxes ![[file.jpg]]",
          embed_source: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    // Navigate to the mixed-content card
    board.press("j")

    const text = stripAnsi(board.screenshot())
    // Top bar should show clean path without ![[
    expect(text).not.toContain("![[")
    expect(text).toContain("Organize into boxes")
  })

  test("multiple inline embeds in mixed content do not leak syntax", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("placeholder")))

        nodes.push({
          id: "multi-embed",
          type: "p" as const,
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "See ![[photo.png]] and ![[doc.pdf]]",
          embed_source: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).not.toContain("![[")
    expect(text).toContain("photo.png")
    expect(text).toContain("doc.pdf")
  })
})
