/**
 * Embed Node Display
 *
 * Embed nodes (content like "![[target]]") should strip the ![[...]] syntax
 * and show just the target name, regardless of whether the target is resolved.
 *
 * Three scenarios:
 * 1. Resolved embed (link_to set, target found): shows target's content
 * 2. Unresolved embed (link_to set, target NOT in repo): strips ![[...]] via regex
 * 3. Unresolved embed (link_to null, content has ![[...]]): should also strip
 *
 * Bug: Case 3 shows "!Target" because the node is not treated as embedded
 * (isEmbedded requires link_to != null), so getDisplayContent returns raw content
 * "![[Target]]" and renderRich strips [[]] but leaves the "!" prefix.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"
import type { KNode } from "@km/core"

describe("embed display", () => {
  test("unresolved embed with link_to=null does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Paragraph embed where link resolver didn't find target (link_to=null)
        // This happens for file references like ![[some-file.pdf]]
        nodes.push({
          id: "unresolved-embed",
          type: "p" as const,
          content: "![[Target File.pdf]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "Target File.pdf" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target name without ! prefix
    expect(text).toContain("Target File.pdf")
    // Should NOT show the ! prefix
    expect(text).not.toContain("!Target")
    expect(text).not.toContain("![[")
  })

  test("unresolved embed with block reference does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Block reference embed like ![[SomeFile#^abc123]]
        nodes.push({
          id: "block-embed",
          type: "p" as const,
          content: "![[SomeFile#^abc123]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "SomeFile" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show the ! prefix
    expect(text).not.toContain("!SomeFile")
    expect(text).not.toContain("![[")
  })

  test("resolved embed shows target content without ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node exists
        nodes.push({
          id: "target-node",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Embed pointing to existing target
        nodes.push({
          id: "resolved-embed",
          type: "p" as const,
          content: "![[target-node]]",
          link_to: "target-node",
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
    // Should show target's content
    expect(text).toContain("Buy groceries")
    // Should NOT show ! prefix or embed syntax
    expect(text).not.toContain("![[")
    expect(text).not.toContain("!Buy")
  })

  test("multiple unresolved embeds in same column strip ! prefix", () => {
    const { board } = testEnv(
      () => {
        // Column has a regular task plus unresolved embeds
        const nodes = item("board", item("col1", item("regular-task")))

        // Multiple unresolved embeds (simulating real-world @next.md with PDFs)
        const embeds = [
          "![[2025 Tax Return.pdf]]",
          "![[Insurance Card.pdf]]",
          "![[Bank Statement.pdf]]",
        ]

        embeds.forEach((content, idx) => {
          nodes.push({
            id: `embed-${idx}`,
            type: "p" as const,
            content,
            link_to: null,
            parent_id: "col1",
            parent_idx: idx + 1,
            data: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "v1",
          } as KNode)
        })

        return nodes
      },
      { columns: 80, rows: 30 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show clean names without ! prefix
    expect(text).toContain("2025 Tax Return.pdf")
    expect(text).toContain("Insurance Card.pdf")
    expect(text).toContain("Bank Statement.pdf")
    // No ! prefixes on content lines
    const lines = text.split("\n")
    const contentLines = lines.filter((l) => l.includes("Tax") || l.includes("Insurance") || l.includes("Bank"))
    for (const line of contentLines) {
      expect(line).not.toContain("!Tax")
      expect(line).not.toContain("!Insurance")
      expect(line).not.toContain("!Bank")
    }
  })
})
