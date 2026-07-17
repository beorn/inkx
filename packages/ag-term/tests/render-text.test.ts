import { describe, expect, it } from "vitest"
import type { AgNode, TextProps } from "@silvery/ag/types"
import { collectTextContent, formatTextLines } from "../src/pipeline/render-text"
import { getTextStyle } from "../src/pipeline/render-helpers"
import { stripAnsi } from "../src/unicode"

// SGR 2 (dim/faint), emitted by styleToAnsi for a context with `dim: true`.
const SGR_DIM = "\x1b[2m"

/**
 * A virtual (nested) `<Text>` node holding style props + direct text content.
 * `layoutNode: null` makes `collectTextContent` treat it as a styled inline
 * child whose props merge into the parent context (the path under test).
 */
function styledText(props: TextProps, text: string): AgNode {
  return {
    type: "silvery-text",
    props,
    children: [],
    layoutNode: null,
    textContent: text,
  } as unknown as AgNode
}

/** A container whose children collectTextContent iterates (applies their props). */
function container(...children: AgNode[]): AgNode {
  return {
    type: "silvery-box",
    props: {},
    children,
    layoutNode: null,
  } as unknown as AgNode
}

describe("formatTextLines", () => {
  it("hard-wraps ANSI-styled text without exposing partial SGR parameters", () => {
    const styled =
      "\x1b[38;2;225;228;232m" +
      'cd "$(git rev-parse --show-toplevel)" && rg --glob "ag/packages/code/**/*.{ts,tsx}" --glob "vendor/silvery/packages/ag-react/src/**/*.tsx"' +
      "\x1b[0m"

    const lines = formatTextLines(styled, 42, "hard")
    const visible = lines.map((line) => stripAnsi(line)).join("\n")

    expect(visible).toContain("--glob")
    expect(visible).not.toMatch(/\b\d{1,3};\d{1,3};\d{1,3}m/)
    expect(visible).not.toContain("[38;2")
  })
})

describe("getTextStyle internal_dim prop", () => {
  // Base cell attrs for a TOP-LEVEL <Text internal_dim>: the reconciler feeds
  // props.internal_dim here just like props.bold. Without it a plain
  // <Text internal_dim>x</Text> renders undimmed. (internal_dim is the
  // deliberately-unadvertised faint escape hatch — token-first policy.)
  it("reads props.internal_dim into base cell attrs (mirrors props.bold)", () => {
    expect(getTextStyle({ internal_dim: true }).attrs.dim).toBe(true)
    expect(getTextStyle({ bold: true }).attrs.bold).toBe(true)
  })

  it("leaves dim falsy when the prop is absent or false", () => {
    expect(getTextStyle({}).attrs.dim).toBeFalsy()
    expect(getTextStyle({ internal_dim: false }).attrs.dim).toBeFalsy()
  })
})

describe("collectTextContent dim inheritance (nested Text)", () => {
  // The style-context builder must mirror bold's `childProps.internal_dim ??
  // parent.dim`: a child's explicit value wins, otherwise it inherits the
  // parent context. (Nested children carry dim via `internal_dim`; the resolved
  // StyleContext field is `dim`.)

  it("nested internal_dim emits SGR 2 (child value wins over an unset parent)", () => {
    const out = collectTextContent(container(styledText({ internal_dim: true }, "x")), {})
    expect(out).toContain(SGR_DIM)
    expect(stripAnsi(out)).toBe("x")
  })

  it("nested internal_dim={false} overrides an inherited-dim parent (no SGR 2)", () => {
    const out = collectTextContent(container(styledText({ internal_dim: false }, "x")), {
      dim: true,
    })
    expect(out).not.toContain(SGR_DIM)
    expect(stripAnsi(out)).toBe("x")
  })

  it("a nested child with no internal_dim inherits the parent's dim (regression guard)", () => {
    const out = collectTextContent(container(styledText({}, "x")), { dim: true })
    expect(out).toContain(SGR_DIM)
  })
})
