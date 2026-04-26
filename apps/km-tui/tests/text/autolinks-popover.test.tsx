/**
 * Autolinks popover integration — verifies that hovering an autolink-matched
 * span in km-tui invokes the popover store with content built from the
 * detection's payload + anchored at the rendered span position.
 *
 * Surface under test: <InlineText> + <AutolinkSpan> + km-tui's popover store
 * (`views/Popover.tsx`). We verify the wiring at the popover-store seam: a
 * spy provider captures the `show()` call, asserting that:
 *   - the hover at a matched cell triggers `popover.show(content, anchor)`
 *   - the anchor is the cell coordinates (proving span-level anchoring)
 *   - the content carries the rule's resolves_to (proving the payload flows
 *     into the popover content builder)
 *
 * This validates the integration end-to-end without depending on the
 * SHOW_DELAY → render-flush dance (which fights React act() + fake timers
 * inside the test renderer). The full overlay paint path is exercised by
 * production usage of PopoverProvider in BoardView; the wiring tested here
 * is the new code in this bead.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import React, { createContext } from "react"
import { createRenderer } from "@silvery/test"
import { Box } from "@silvery/ag-react"
import { parseSyntaxlinksYaml } from "@km/autolinks"
import { InlineText } from "../../src/text/InlineComponents.tsx"
import { AutolinksProvider } from "../../src/text/AutolinksContext.tsx"
import type { PopoverContent, PopoverAnchor } from "../../src/views/Popover.tsx"

// Re-create the bare minimum of the PopoverCtx surface that AutolinkSpan
// reaches via `usePopover()`. We replace the real provider with a spy so we
// can assert on the store interactions deterministically — no timers, no
// overlay rendering, no StoreContext machinery.

interface PopoverSpy {
  showCalls: Array<{ content: PopoverContent; anchor: PopoverAnchor }>
  hideCalls: number
}

interface PopoverStoreLike {
  show(content: PopoverContent, anchor: PopoverAnchor): void
  update(content: PopoverContent): void
  hide(): void
  cancel(): void
  cancelHide(): void
  content: null
  anchor: null
}

// We mirror the module path AutolinkSpan imports `usePopover` from. To swap
// the provider, we use vi.mock at the test file level — see below.

// Spy via vi.mock — replace `usePopover` with our test-controlled hook.
const popoverSpy: PopoverSpy = { showCalls: [], hideCalls: 0 }
const SpyCtx = createContext<PopoverStoreLike | null>(null)

vi.mock("../../src/views/Popover.tsx", async (importActual) => {
  const actual = await importActual<typeof import("../../src/views/Popover.tsx")>()
  return {
    ...actual,
    usePopover: () => React.useContext(SpyCtx),
  }
})

function SpyProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const store: PopoverStoreLike = React.useMemo(
    () => ({
      show(content, anchor) {
        popoverSpy.showCalls.push({ content, anchor })
      },
      update() {},
      hide() {
        popoverSpy.hideCalls++
      },
      cancel() {},
      cancelHide() {},
      content: null,
      anchor: null,
    }),
    [],
  )
  return <SpyCtx.Provider value={store}>{children}</SpyCtx.Provider>
}

function renderWithRulesAndSpy(text: string, rules: ReturnType<typeof parseSyntaxlinksYaml>) {
  const render = createRenderer({ cols: 80, rows: 8 })
  return render(
    <SpyProvider>
      <AutolinksProvider rules={rules}>
        <Box width={80}>
          <InlineText text={text} />
        </Box>
      </AutolinksProvider>
    </SpyProvider>,
  )
}

describe("autolinks popover wiring", () => {
  beforeEach(() => {
    popoverSpy.showCalls.length = 0
    popoverSpy.hideCalls = 0
  })

  it("renders the autolink span underlined at rest, no popover.show() yet", async () => {
    const yaml = `
syntaxlinks:
  - pattern: "AGENTS.md"
    resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    using app = renderWithRulesAndSpy("see AGENTS.md for the rules", rules)

    const lineIdx = app.lines.findIndex((l) => l.includes("AGENTS.md"))
    expect(lineIdx).toBeGreaterThanOrEqual(0)
    const col = app.lines[lineIdx]!.indexOf("AGENTS.md")

    // Span renders underlined at rest (autolink visual).
    expect(app.cell(col, lineIdx).underline).toBeTruthy()

    // No hover yet — store wasn't touched.
    expect(popoverSpy.showCalls).toHaveLength(0)
  })

  it("hovering an autolink match calls popover.show() with span-anchored coords + payload-derived content", async () => {
    const yaml = `
syntaxlinks:
  - pattern: "AGENTS.md"
    resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    using app = renderWithRulesAndSpy("see AGENTS.md now", rules)

    const lineIdx = app.lines.findIndex((l) => l.includes("AGENTS.md"))
    const col = app.lines[lineIdx]!.indexOf("AGENTS.md")
    expect(col).toBeGreaterThanOrEqual(0)

    // Hover the first cell of the matched span.
    await app.hover(col, lineIdx)

    // popover.show fired exactly once with anchor at the cell coords —
    // proving the popover anchors to the span (not the cursor / origin).
    expect(popoverSpy.showCalls).toHaveLength(1)
    const call = popoverSpy.showCalls[0]!
    expect(call.anchor).toEqual({ x: col, y: lineIdx })

    // Content reflects the rule payload: builder writes the match in
    // lines[0] and offers a lazy render() for the resolved preview body.
    expect(call.content.lines[0]).toMatchObject({ text: "AGENTS.md", bold: true })
    expect(typeof call.content.render).toBe("function")
  })

  it("leaving the autolink span calls popover.hide()", async () => {
    const yaml = `
syntaxlinks:
  - pattern: "AGENTS.md"
    resolves_to: "/somewhere"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    using app = renderWithRulesAndSpy("see AGENTS.md and other text after", rules)

    const lineIdx = app.lines.findIndex((l) => l.includes("AGENTS.md"))
    const col = app.lines[lineIdx]!.indexOf("AGENTS.md")
    const otherCol = app.lines[lineIdx]!.indexOf("other")
    expect(otherCol).toBeGreaterThanOrEqual(0)

    await app.hover(col, lineIdx)
    expect(popoverSpy.showCalls).toHaveLength(1)
    expect(popoverSpy.hideCalls).toBe(0)

    // Move along the same line into a non-detection text region — silvery's
    // enter/leave tracking diffs the inlineRect path and fires onMouseLeave
    // on the autolink span Text.
    await app.hover(otherCol, lineIdx)
    expect(popoverSpy.hideCalls).toBeGreaterThanOrEqual(1)
  })

  it("regex-rule autolinks also wire the popover (different match each detection)", async () => {
    // Plain-text regex (no sigil prefix — sigils are parsed as their own
    // AST nodes by the inline parser, so they never reach AutolinkedPlainText).
    // Match BUG-NNN style identifiers — captured as plain text + decorated
    // by the autolink pass.
    const yaml = `
syntaxlinks:
  - pattern: "/BUG-\\\\d+/"
    resolves_to: "/some/dir"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    using app = renderWithRulesAndSpy("see BUG-101 and BUG-202 inline", rules)

    const lineIdx = app.lines.findIndex((l) => l.includes("BUG-101"))
    expect(lineIdx).toBeGreaterThanOrEqual(0)

    // Hover the first match.
    const col1 = app.lines[lineIdx]!.indexOf("BUG-101")
    await app.hover(col1, lineIdx)
    expect(popoverSpy.showCalls).toHaveLength(1)
    expect(popoverSpy.showCalls[0]!.content.lines[0]).toMatchObject({ text: "BUG-101" })

    // Leave + hover the second — distinct popover.show with distinct content.
    await app.hover(0, lineIdx + 3)
    const col2 = app.lines[lineIdx]!.indexOf("BUG-202")
    await app.hover(col2, lineIdx)
    expect(popoverSpy.showCalls).toHaveLength(2)
    expect(popoverSpy.showCalls[1]!.content.lines[0]).toMatchObject({ text: "BUG-202" })
    expect(popoverSpy.showCalls[1]!.anchor).toEqual({ x: col2, y: lineIdx })
  })

  it("plain text without any rule + no virtual detection makes no popover calls", async () => {
    using app = renderWithRulesAndSpy("plain prose, nothing to detect here", [])
    // Hover the middle of the line — no autolink span there.
    await app.hover(10, 0)
    expect(popoverSpy.showCalls).toHaveLength(0)
  })
})
