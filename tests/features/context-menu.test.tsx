import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { AgNode } from "@silvery/ag/types"
import { Box, ContextMenu } from "../../src/index.js"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findByComponent(node: AgNode, component: string): AgNode | null {
  if ((node.props as Record<string, unknown>)["data-component"] === component) return node
  for (const child of node.children) {
    const hit = findByComponent(child, component)
    if (hit) return hit
  }
  return null
}

describe("ContextMenu", () => {
  test("renders a themed focus scope at pointer coordinates with canonical list navigation", () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    const app = render(
      <Box width={40} height={12}>
        <ContextMenu
          open
          x={38}
          y={11}
          width={14}
          maxVisible={2}
          items={[
            { label: "Open", value: "open" },
            { label: "Delete", value: "delete" },
          ]}
          onSelect={() => {}}
          onClose={() => {}}
        />
      </Box>,
    )

    expect(app.text).toContain("Open")
    expect(app.text).toContain("Delete")

    const menu = findByComponent(getRoot(app), "ContextMenu")
    expect(menu).not.toBeNull()
    expect((menu!.props as Record<string, unknown>).focusScope).toBe(true)
    expect((menu!.props as Record<string, unknown>).autoFocus).toBe(true)
    expect(findByComponent(menu!, "ListView")).not.toBeNull()

    const rect = menu!.boxRect
    expect(rect).not.toBeNull()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.y).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(40)
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(12)
  })
})
