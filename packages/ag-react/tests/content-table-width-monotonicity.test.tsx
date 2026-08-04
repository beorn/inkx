/**
 * Content.Table must not lose labels or whole columns as its container widens.
 *
 * These are rendered-output gates for @si/content/22774. The ancestor trace in
 * each failure records every width-owning box from the source cell to the root,
 * so a regression names the first geometry disagreement instead of inviting
 * another predicate at the final clip site.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../src/components/Box"
import { Content } from "../src/ui/components/Content"

const TOOL_HEADERS = ["tool", "what it is"]
const TOOL_ROWS: [string, string][] = [
  ["ag", "agent host — all agents, all accounts, all together in your terminal"],
  ["hab", "local habitat workspace for humans and agents"],
  ["dutiful", "watcher and pane supervisor; bare commands stay live, -n reruns on a grid"],
]

const ASPECT_HEADERS = ["thing", "definition", "session", "instance"]
const ASPECT_ROWS = [
  ["habitant", "its row in hab.ts", "the transcript", "the live process"],
  ["hab", "hab.ts itself", "its durable state on a host", "habd serving it"],
  ["sandbox", "sandbox: docker", "the leased box", "the running container"],
]

function renderTable(cols: number, headers: string[], rows: string[][]) {
  const render = createRenderer({ cols, rows: 24 })
  return render(
    <Box width={cols} flexDirection="column">
      <Content.Layout fill={false} prose={80} wide={120}>
        <Content.Row>
          <Content.Body width="auto">
            <Content.Table headers={headers} rows={rows} />
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
}

function widthTrace(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  sourceText: string,
): string {
  const trace: unknown[] = []
  let node = app.getByText(sourceText).resolve()
  while (node) {
    const props = node.props as Record<string, unknown>
    trace.push({
      type: node.type,
      component: props["data-component"],
      width: props.width,
      minWidth: props.minWidth,
      maxWidth: props.maxWidth,
      fitWidth: props.fitWidth,
      alignSelf: props.alignSelf,
      justifyContent: props.justifyContent,
      overflow: props.overflow,
      boxRect: node.boxRect,
      scrollRect: node.scrollRect,
    })
    node = node.parent
  }
  return JSON.stringify(trace, null, 2)
}

function componentRect(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  sourceText: string,
  component: string,
): { x: number; y: number; width: number; height: number } {
  let node = app.getByText(sourceText).resolve()
  while (node) {
    if ((node.props as Record<string, unknown>)["data-component"] === component) {
      if (node.boxRect === null) {
        throw new Error(`${component} has no computed box for ${JSON.stringify(sourceText)}`)
      }
      return node.boxRect
    }
    node = node.parent
  }
  throw new Error(`No ${component} ancestor for ${JSON.stringify(sourceText)}`)
}

function visibleContent(text: string): string {
  return text.replace(/[┌┬┐├┼┤└┴┘│─]/gu, "").replace(/\s/gu, "")
}

function visibleNodeContent(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  sourceText: string,
): string {
  const node = app.getByText(sourceText).resolve()
  if (node === null) throw new Error(`No rendered node for ${JSON.stringify(sourceText)}`)
  if (node.boxRect === null) throw new Error(`No computed box for ${JSON.stringify(sourceText)}`)
  const { x, y, width, height } = node.boxRect
  return visibleContent(
    app.lines
      .slice(y, y + height)
      .map((line) => line.slice(x, x + width))
      .join("\n"),
  )
}

describe("Content.Table width monotonicity (@si/content/22774)", () => {
  test("widening 87 → 88 never hides first-column labels", () => {
    const at87 = renderTable(87, TOOL_HEADERS, TOOL_ROWS)
    const at88 = renderTable(88, TOOL_HEADERS, TOOL_ROWS)
    const trace = `87:\n${widthTrace(at87, "tool")}\n88:\n${widthTrace(at88, "tool")}`

    for (const label of TOOL_HEADERS.slice(0, 1).concat(TOOL_ROWS.map(([label]) => label!))) {
      expect(at87.text, trace).toContain(label)
      expect(at88.text, trace).toContain(label)
    }
  })

  test("a wider container never drops the instance column", () => {
    const at80 = renderTable(80, ASPECT_HEADERS, ASPECT_ROWS)
    const at140 = renderTable(140, ASPECT_HEADERS, ASPECT_ROWS)
    const trace = `80:\n${widthTrace(at80, "thing")}\n140:\n${widthTrace(at140, "thing")}`

    expect(at80.text, trace).toContain("instance")
    expect(at140.text, trace).toContain("instance")
    expect(at140.text, trace).toContain("the live process")
  })

  test("a fitting table is centered on frame zero without measurement", () => {
    const app = renderTable(160, TOOL_HEADERS, TOOL_ROWS)
    const rect = componentRect(app, "tool", "content-table-grid")
    const leftGap = rect.x
    const rightGap = 160 - (rect.x + rect.width)

    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
    expect(rect.x).toBeGreaterThan(0)
  })

  test("a constrained table wraps instead of losing cell content", () => {
    const app = renderTable(30, TOOL_HEADERS, TOOL_ROWS)
    const trace = widthTrace(app, "tool")

    for (const label of TOOL_HEADERS.slice(0, 1).concat(TOOL_ROWS.map(([label]) => label!))) {
      expect(visibleNodeContent(app, label), trace).toContain(visibleContent(label))
    }
    for (const [, content] of TOOL_ROWS) {
      expect(visibleNodeContent(app, content), trace).toContain(visibleContent(content))
    }
  })

  test("an impossible width marks loss before exposing unlabeled middle content", () => {
    const app = renderTable(8, TOOL_HEADERS, TOOL_ROWS)

    expect(app.text).toContain("…")
    expect(app.text).not.toContain("agent host")
    expect(componentRect(app, "tool", "content-table-grid").x).toBeGreaterThanOrEqual(0)
  })
})
