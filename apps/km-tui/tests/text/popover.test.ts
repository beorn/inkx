/**
 * Tests for the popover system — URL popover content generation
 * and integration with link rendering.
 */

import { describe, it, expect } from "vitest"
import { urlPopoverContent, internalLinkPopoverContent } from "../../src/views/Popover.tsx"

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
