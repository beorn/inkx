/**
 * Tests for URL metadata extraction (regex-based HTML parsing).
 */

import { describe, it, expect } from "vitest"
import { extractMetadata } from "../../src/text/url-metadata.ts"

describe("extractMetadata", () => {
  it("extracts <title>", () => {
    const html = "<html><head><title>My Page Title</title></head></html>"
    expect(extractMetadata(html).title).toBe("My Page Title")
  })

  it("extracts og:title (overrides <title>)", () => {
    const html = `
      <html><head>
        <title>Fallback Title</title>
        <meta property="og:title" content="OG Title">
      </head></html>`
    expect(extractMetadata(html).title).toBe("OG Title")
  })

  it("extracts og:description", () => {
    const html = `<meta property="og:description" content="A great description.">`
    expect(extractMetadata(html).description).toBe("A great description.")
  })

  it("falls back to meta name=description", () => {
    const html = `<meta name="description" content="Fallback description.">`
    expect(extractMetadata(html).description).toBe("Fallback description.")
  })

  it("prefers og:description over meta name=description", () => {
    const html = `
      <meta name="description" content="Fallback">
      <meta property="og:description" content="OG Desc">`
    expect(extractMetadata(html).description).toBe("OG Desc")
  })

  it("extracts twitter:title as fallback", () => {
    const html = `<meta name="twitter:title" content="Twitter Title">`
    expect(extractMetadata(html).title).toBe("Twitter Title")
  })

  it("extracts twitter:description as fallback", () => {
    const html = `<meta name="twitter:description" content="Twitter Desc">`
    expect(extractMetadata(html).description).toBe("Twitter Desc")
  })

  it("extracts og:image", () => {
    const html = `<meta property="og:image" content="https://example.com/image.jpg">`
    expect(extractMetadata(html).image).toBe("https://example.com/image.jpg")
  })

  it("extracts og:site_name", () => {
    const html = `<meta property="og:site_name" content="Example Site">`
    expect(extractMetadata(html).siteName).toBe("Example Site")
  })

  it("handles reversed attribute order (content before property)", () => {
    const html = `<meta content="Reversed Title" property="og:title">`
    expect(extractMetadata(html).title).toBe("Reversed Title")
  })

  it("handles reversed attribute order for name meta", () => {
    const html = `<meta content="Reversed Desc" name="description">`
    expect(extractMetadata(html).description).toBe("Reversed Desc")
  })

  it("handles single quotes", () => {
    const html = `<meta property='og:title' content='Single Quoted'>`
    expect(extractMetadata(html).title).toBe("Single Quoted")
  })

  it("handles extra whitespace around =", () => {
    const html = `<meta property = "og:title" content = "Spaced Out">`
    expect(extractMetadata(html).title).toBe("Spaced Out")
  })

  it("case-insensitive tag matching", () => {
    const html = `<META PROPERTY="og:title" CONTENT="Uppercase Tags">`
    expect(extractMetadata(html).title).toBe("Uppercase Tags")
  })

  it("decodes HTML entities in content", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry&apos;s &quot;Adventure&quot;">`
    expect(extractMetadata(html).title).toBe(`Tom & Jerry's "Adventure"`)
  })

  it("decodes numeric HTML entities", () => {
    const html = `<meta property="og:title" content="Hello &#8212; World &#x2014; End">`
    expect(extractMetadata(html).title).toBe("Hello — World — End")
  })

  it("decodes double-encoded HTML entities", () => {
    const html = `<meta property="og:description" content="integrating &amp;amp; using Textract">`
    expect(extractMetadata(html).description).toBe("integrating & using Textract")
  })

  it("decodes &amp;nbsp; double-encoded", () => {
    const html = `<meta property="og:title" content="Hello&amp;nbsp;World">`
    expect(extractMetadata(html).title).toBe("Hello\u00A0World")
  })

  it("truncates very long title", () => {
    const longTitle = "A".repeat(200)
    const html = `<meta property="og:title" content="${longTitle}">`
    const meta = extractMetadata(html)
    expect(meta.title!.length).toBeLessThanOrEqual(120)
    expect(meta.title!.endsWith("…")).toBe(true)
  })

  it("truncates very long description", () => {
    const longDesc = "B".repeat(300)
    const html = `<meta property="og:description" content="${longDesc}">`
    const meta = extractMetadata(html)
    expect(meta.description!.length).toBeLessThanOrEqual(200)
    expect(meta.description!.endsWith("…")).toBe(true)
  })

  it("returns empty metadata for non-HTML", () => {
    const meta = extractMetadata("not html at all")
    expect(meta.title).toBeUndefined()
    expect(meta.description).toBeUndefined()
  })

  it("handles self-closing meta tags", () => {
    const html = `<meta property="og:title" content="Self Closing" />`
    expect(extractMetadata(html).title).toBe("Self Closing")
  })

  it("handles multiline title tag", () => {
    const html = `<title>
      Multi Line
      Title
    </title>`
    expect(extractMetadata(html).title).toBe("Multi Line\n      Title")
  })

  // Real-world HTML snippets
  it("extracts from GitHub-like HTML", () => {
    const html = `
      <head>
        <title>beorn/km: Knowledge Machine</title>
        <meta property="og:title" content="GitHub - beorn/km: Knowledge Machine">
        <meta property="og:description" content="Workspace for agentic knowledge workers">
        <meta property="og:site_name" content="GitHub">
        <meta property="og:image" content="https://opengraph.githubassets.com/abc/beorn/km">
      </head>`
    const meta = extractMetadata(html)
    expect(meta.title).toBe("GitHub - beorn/km: Knowledge Machine")
    expect(meta.description).toBe("Workspace for agentic knowledge workers")
    expect(meta.siteName).toBe("GitHub")
    expect(meta.image).toBe("https://opengraph.githubassets.com/abc/beorn/km")
  })

  it("extracts from HN-like HTML", () => {
    const html = `
      <head>
        <title>A Social Filesystem | Hacker News</title>
      </head>`
    const meta = extractMetadata(html)
    expect(meta.title).toBe("A Social Filesystem | Hacker News")
  })

  it("extracts from Substack-like HTML", () => {
    const html = `
      <head>
        <meta property="og:title" content="The Death of Software 2.0 (A Better Analogy!)">
        <meta property="og:description" content="Why the transition from Software 1.0 to 2.0 is more like the shift from horses to cars.">
        <meta property="og:site_name" content="Fabricated Knowledge">
      </head>`
    const meta = extractMetadata(html)
    expect(meta.title).toBe("The Death of Software 2.0 (A Better Analogy!)")
    expect(meta.description).toBe(
      "Why the transition from Software 1.0 to 2.0 is more like the shift from horses to cars.",
    )
    expect(meta.siteName).toBe("Fabricated Knowledge")
  })
})
