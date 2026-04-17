import { describe, expect, test } from "vitest"
import { normalizeLinkHref } from "../src/link-href.ts"

describe("normalizeLinkHref — wiki form", () => {
  test.each([
    ["Note", "km:Note"],
    ["Project/Alpha", "km:Project/Alpha"],
    ["Note#Section", "km:Note#Section"],
    ["Note^abc", "km:Note#^abc"],
    ["@Alice", "km:@Alice"],
    ["+cleanup", "km:+cleanup"],
  ])("[[%s]] → %s", (label, href) => {
    expect(normalizeLinkHref("wiki", label)).toBe(href)
  })

  test("[[#Section]] is self-ref, not tag", () => {
    expect(normalizeLinkHref("wiki", "#Section")).toBe("#Section")
  })

  test("[[#^abc]] is self-ref to block", () => {
    expect(normalizeLinkHref("wiki", "#^abc")).toBe("#^abc")
  })
})

describe("normalizeLinkHref — bare form", () => {
  test.each([
    ["Alice", "km:Alice"],
    ["@Alice", "km:@Alice"],
    ["+cleanup", "km:+cleanup"],
    ["#urgent", "km:%23urgent"],
  ])("bare %s → %s", (label, href) => {
    expect(normalizeLinkHref("bare", label)).toBe(href)
  })

  test("external URL passes through", () => {
    expect(normalizeLinkHref("bare", "https://example.com/")).toBe("https://example.com/")
  })

  test("mailto passes through", () => {
    expect(normalizeLinkHref("bare", "mailto:alice@example.com")).toBe("mailto:alice@example.com")
  })
})

describe("normalizeLinkHref — mdlink / autolink pass-through", () => {
  test("mdlink preserves URL", () => {
    expect(normalizeLinkHref("mdlink", "https://example.com/path?q=1")).toBe("https://example.com/path?q=1")
  })

  test("mdlink preserves self-ref", () => {
    expect(normalizeLinkHref("mdlink", "#Section")).toBe("#Section")
  })

  test("autolink preserves URL", () => {
    expect(normalizeLinkHref("autolink", "https://example.com/")).toBe("https://example.com/")
  })
})

describe("normalizeLinkHref — determinism", () => {
  test("same input → same output across calls", () => {
    for (let i = 0; i < 10; i++) {
      expect(normalizeLinkHref("wiki", "Alice")).toBe("km:Alice")
      expect(normalizeLinkHref("bare", "#urgent")).toBe("km:%23urgent")
    }
  })
})

describe("normalizeLinkHref — edge cases", () => {
  test("empty label throws", () => {
    expect(() => normalizeLinkHref("wiki", "")).toThrow(TypeError)
    expect(() => normalizeLinkHref("bare", "")).toThrow(TypeError)
  })
})
