/**
 * Inline Rects — virtual text nodes (nested <Text>) get screen-space rects
 * computed during text rendering, enabling hit testing and mouse events.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Link, Text } from "@silvery/ag-react"

describe("inline rects", () => {
  test("nested Text gets inlineRects after render", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Hello{" "}
        <Text testID="inner" color="blue">
          world
        </Text>
      </Text>,
    )
    const inner = app.getByTestId("inner").resolve()
    expect(inner).not.toBeNull()
    expect(inner!.inlineRects).toBeDefined()
    expect(inner!.inlineRects!.length).toBeGreaterThan(0)
    // "world" starts after "Hello " (6 chars) at x=6
    expect(inner!.inlineRects![0]!.x).toBe(6)
    expect(inner!.inlineRects![0]!.width).toBe(5)
  })

  test("nodeAt finds nested Text via inlineRects", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Hello{" "}
        <Text testID="link" color="blue">
          world
        </Text>
      </Text>,
    )
    const hit = app.term.nodeAt(6, 0) // "world" at col 6
    expect(hit).not.toBeNull()
    expect((hit!.props as any).testID).toBe("link")
  })

  test("onMouseEnter fires on nested Text via hover", async () => {
    const onEnter = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Text>
          Hello <Text onMouseEnter={onEnter}>world</Text>
        </Text>
        <Text>other</Text>
      </Box>,
    )
    await app.hover(6, 0)
    expect(onEnter).toHaveBeenCalled()
  })

  test("onMouseLeave fires when moving away", async () => {
    const onLeave = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Text>
          Hello <Text onMouseLeave={onLeave}>world</Text>
        </Text>
        <Text>other line</Text>
      </Box>,
    )
    await app.hover(6, 0) // enter
    await app.hover(0, 1) // leave
    expect(onLeave).toHaveBeenCalled()
  })

  test("onClick fires on nested Text", async () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Click <Text onClick={onClick}>here</Text>
      </Text>,
    )
    await app.click(6, 0)
    expect(onClick).toHaveBeenCalled()
  })

  test("nodeAt finds a Text nested two levels deep", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Click{" "}
        <Text testID="strong" bold>
          bold <Text testID="link">here</Text>
        </Text>
      </Text>,
    )
    // "Click bold here" — "here" starts at col 11.
    const hit = app.term.nodeAt(11, 0)
    expect(hit).not.toBeNull()
    expect((hit!.props as any).testID).toBe("link")
    // The wrapper still wins where it isn't covered by the inner run.
    expect((app.term.nodeAt(6, 0)!.props as any).testID).toBe("strong")
  })

  test("onClick fires on a Text nested inside another styled Text", async () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Click{" "}
        <Text bold>
          bold <Text onClick={onClick}>here</Text>
        </Text>
      </Text>,
    )
    await app.click(11, 0)
    expect(onClick).toHaveBeenCalled()
  })

  test("onClick on a deeply nested Text still fires when it wraps", async () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 12, rows: 5 })
    const app = render(
      <Text wrap="wrap">
        aaa bbb{" "}
        <Text bold>
          ccc <Text onClick={onClick}>ddd</Text>
        </Text>
      </Text>,
    )
    // "aaa bbb ccc" fills line 0 (11 cols); "ddd" wraps to line 1.
    expect(app.lines[1]).toContain("ddd")
    await app.click(1, 1)
    expect(onClick).toHaveBeenCalled()
  })

  test("onMouseEnter fires on a Text nested two levels deep", async () => {
    const onEnter = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Text>
          Click{" "}
          <Text bold>
            bold <Text onMouseEnter={onEnter}>here</Text>
          </Text>
        </Text>
        <Text>other</Text>
      </Box>,
    )
    await app.hover(11, 0)
    expect(onEnter).toHaveBeenCalled()
  })

  test("a Link nested in styled text is the hover target that carries its cursor", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        See{" "}
        <Text bold>
          the{" "}
          <Link testID="link" onClick={() => {}}>
            docs
          </Link>
        </Text>
      </Text>,
    )
    // mouseCursor and the reveal treatment both hang off the Link node, and
    // `resolveMouseCursor` walks UP from the hover target — a target stuck on
    // the wrapper can never reach a Link nested inside it.
    await app.hover(8, 0)
    const hit = app.term.nodeAt(8, 0)
    expect((hit!.props as any).testID).toBe("link")
    expect((hit!.props as any).mouseCursor).toBe("pointer")
  })

  test("a Link nested in styled text keeps its OSC 8 hyperlink", () => {
    const href = "https://example.com/docs"
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        See{" "}
        <Text bold>
          the <Link href={href}>docs</Link>
        </Text>
      </Text>,
    )
    // "See the docs" — "docs" starts at col 8. Hyperlink emission threads
    // through the style context during collection, which recurses on its own;
    // this pins that it stays independent of the hit-test walk.
    expect(app.cell(8, 0).hyperlink).toBe(href)
    expect((app.term.nodeAt(8, 0)!.props as any).internal_hyperlink).toBe(href)
  })

  test("all virtual text nodes get inlineRects (unconditional)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        <Text testID="plain" bold>
          bold
        </Text>{" "}
        and{" "}
        <Text testID="colored" color="red">
          red
        </Text>
      </Text>,
    )
    const plain = app.getByTestId("plain").resolve()
    const colored = app.getByTestId("colored").resolve()
    expect(plain!.inlineRects).toBeDefined()
    expect(colored!.inlineRects).toBeDefined()
  })
})
