/**
 * Tests for the popover system — URL popover content generation
 * and integration with link rendering.
 */

import React from "react"
import { describe, it, expect, test } from "vitest"
import {
  urlPopoverContent,
  internalLinkPopoverContent,
  computeOverlapPosition,
  computePointPosition,
} from "../../src/views/Popover.tsx"
import { createFakeRepo } from "@km/storage"
import { buildNodePopoverContent } from "../../src/views/tree-node-shared.ts"

// =============================================================================
// urlPopoverContent
// =============================================================================

describe("urlPopoverContent", () => {
  it("shows domain bold and path dim for simple URL", () => {
    const result = urlPopoverContent("https://example.com/path/page")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toMatchObject({ text: "example.com", bold: true, color: "$link", link: true })
    expect(result.lines[1]).toMatchObject({ text: "/path/page", dim: true })
    expect(result.href).toBe("https://example.com/path/page")
  })

  it("strips www from domain", () => {
    const result = urlPopoverContent("https://www.example.com/docs")
    expect(result.lines[0]?.text).toBe("example.com")
  })

  it("shows only domain for bare domain URL", () => {
    const result = urlPopoverContent("https://example.com")
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.text).toBe("example.com")
  })

  it("includes query string in path line", () => {
    const result = urlPopoverContent("https://example.com/search?q=test&page=2")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1]?.text).toBe("/search?q=test&page=2")
  })

  it("includes fragment in path line", () => {
    const result = urlPopoverContent("https://example.com/page#section")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1]?.text).toBe("/page#section")
  })

  it("handles Google Docs URL", () => {
    const result = urlPopoverContent("https://docs.google.com/document/d/1kW5K56kbUczBYilTR2/edit")
    expect(result.lines[0]?.text).toBe("docs.google.com")
    expect(result.lines[1]?.text).toContain("/document/d/")
  })

  it("handles x.com tweet URL", () => {
    const result = urlPopoverContent("https://x.com/user/status/123456789")
    expect(result.lines[0]?.text).toBe("x.com")
    expect(result.lines[1]?.text).toBe("/user/status/123456789")
  })

  it("handles URL with only query (no path)", () => {
    const result = urlPopoverContent("https://example.com?key=value")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]?.text).toBe("example.com")
    expect(result.lines[1]?.text).toBe("?key=value")
  })

  it("handles URL without protocol", () => {
    const result = urlPopoverContent("example.com/path")
    expect(result.lines[0]?.text).toBe("example.com")
    expect(result.lines[1]?.text).toBe("/path")
  })
})

// =============================================================================
// internalLinkPopoverContent
// =============================================================================

describe("internalLinkPopoverContent", () => {
  it("shows title bold", () => {
    const result = internalLinkPopoverContent("My Note Title")
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toEqual({ text: "My Note Title", bold: true })
  })

  it("shows title and preview when preview provided", () => {
    const result = internalLinkPopoverContent("My Note", "First line of content...")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toEqual({ text: "My Note", bold: true })
    expect(result.lines[1]).toEqual({ text: "First line of content...", dim: true })
  })
})

// =============================================================================
// computeOverlapPosition — corner cascade for card overlap
// =============================================================================

describe("computeOverlapPosition", () => {
  const viewport = { cols: 80, rows: 24 }

  it("prefers top-left aligned when popover fits", () => {
    const cardRect = { x: 10, y: 5, width: 20, height: 4 }
    const result = computeOverlapPosition(cardRect, 40, 15, viewport)
    // Top-left of popover = top-left of card
    expect(result).toEqual({ top: 5, left: 10 })
  })

  it("falls back to top-right when popover overflows right edge", () => {
    // Card near right edge — popover (width=40) would overflow at x=50+40=90 > 80
    const cardRect = { x: 50, y: 5, width: 20, height: 4 }
    const result = computeOverlapPosition(cardRect, 40, 15, viewport)
    // Top-right aligned: popover's right edge = card's right edge (50+20=70)
    // So left = 70 - 40 = 30
    expect(result).toEqual({ top: 5, left: 30 })
  })

  it("falls back to bottom-left when popover overflows bottom edge", () => {
    // Card near bottom — popover (height=15) would overflow at y=15+15=30 > 24
    const cardRect = { x: 5, y: 15, width: 20, height: 4 }
    const result = computeOverlapPosition(cardRect, 30, 15, viewport)
    // Bottom-left aligned: popover's bottom = card's bottom (15+4=19)
    // So top = 19 - 15 = 4
    expect(result).toEqual({ top: 4, left: 5 })
  })

  it("falls back to bottom-right when overflowing both right and bottom", () => {
    // Card at bottom-right corner
    const cardRect = { x: 50, y: 15, width: 20, height: 4 }
    const result = computeOverlapPosition(cardRect, 40, 15, viewport)
    // Bottom-right aligned: popover's bottom-right = card's bottom-right
    // top = (15+4) - 15 = 4, left = (50+20) - 40 = 30
    expect(result).toEqual({ top: 4, left: 30 })
  })

  it("clamps to viewport when no corner fits", () => {
    // Tiny viewport, large popover
    const smallViewport = { cols: 30, rows: 10 }
    const cardRect = { x: 0, y: 0, width: 10, height: 3 }
    const result = computeOverlapPosition(cardRect, 40, 15, smallViewport)
    // Clamped to fit as best as possible
    expect(result.top).toBeGreaterThanOrEqual(0)
    expect(result.left).toBeGreaterThanOrEqual(0)
  })

  it("uses top-left for card at origin with space", () => {
    const cardRect = { x: 0, y: 0, width: 20, height: 3 }
    const result = computeOverlapPosition(cardRect, 30, 10, viewport)
    expect(result).toEqual({ top: 0, left: 0 })
  })
})

// =============================================================================
// computePointPosition — point-based positioning (inline links)
// =============================================================================

describe("computePointPosition", () => {
  const viewport = { cols: 80, rows: 24 }

  it("places popover below the anchor point", () => {
    const anchor = { x: 10, y: 5 }
    const result = computePointPosition(anchor, 40, 10, viewport)
    expect(result).toEqual({ top: 6, left: 10 })
  })

  it("clamps to viewport when anchor is near bottom", () => {
    const anchor = { x: 10, y: 20 }
    const result = computePointPosition(anchor, 40, 10, viewport)
    // y+1=21, 21+10=31 > 24, so clamped: max(0, 24-10) = 14
    expect(result.top).toBe(14)
  })

  it("clamps to viewport when anchor is near right edge", () => {
    const anchor = { x: 60, y: 5 }
    const result = computePointPosition(anchor, 40, 10, viewport)
    // x=60, 60+40=100 > 80, so clamped: max(0, 80-40) = 40
    expect(result.left).toBe(40)
  })
})

// =============================================================================
// buildNodePopoverContent — shape and laziness
//
// The popover overlay is now mounted inside the pane's providers (see
// BoardView.tsx), so all per-pane contexts cascade to the popover content
// through the fiber tree. buildNodePopoverContent doesn't need to thread or
// capture any context — its render() callback just creates a plain element.
// The end-to-end cascade is verified by higher-level hover tests; these unit
// tests cover the builder's contract: it returns a PopoverContent whose
// render is a lazy function (so DocContent's lazy-require of DetailView
// doesn't fire until a popover is actually shown).
// =============================================================================

function makeFakeNode(id: string, content: string) {
  const baseTs = Date.now()
  return {
    id,
    type: "h" as const,
    item: {},
    fstype: "mdsection" as const,
    content,
    title: content,
    parent_id: null,
    parent_idx: 0,
    embed_of: null,
    data: {},
    created_at: baseTs,
    updated_at: baseTs,
    version: "fake",
  }
}

const inertInlineCtx = {
  resolveWikiLink: () => null,
  resolveWikiLinkId: () => null,
  resolveBlockRef: () => null,
  hideFields: true,
}

describe("buildNodePopoverContent", () => {
  test("returns a PopoverContent with a lazy render() callback", () => {
    const repo = createFakeRepo({ nodes: [makeFakeNode("h1", "My Heading") as never] })
    const node = repo.getNode("h1")!

    const content = buildNodePopoverContent(node, repo, inertInlineCtx)

    // Contract: lines[] is empty (no plain-text fallback — we render rich content)
    expect(content.lines).toEqual([])
    expect(typeof content.render).toBe("function")

    // Calling render() yields a React element without throwing. The element
    // is the PopoverNodeBody wrapper — not a context provider, because
    // contexts cascade through the fiber tree from the popover overlay's
    // ancestors (PopoverProvider lives inside NodeStore/TreeRender providers
    // per BoardView.tsx).
    const tree = content.render!() as React.ReactElement
    expect(tree).not.toBeNull()
    expect(typeof tree.type).toBe("function")
  })

  test("respects custom maxWidth", () => {
    const repo = createFakeRepo({ nodes: [makeFakeNode("h2", "Wide") as never] })
    const node = repo.getNode("h2")!

    const content = buildNodePopoverContent(node, repo, inertInlineCtx, 80)
    expect(content.maxWidth).toBe(80)
  })
})
